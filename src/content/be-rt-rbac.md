Authentication answers "who are you?" — authorization answers "what are you allowed to do?" — and RBAC structures that answer as a matrix of roles to permissions enforced at every layer.

## The core

**RBAC (Role-Based Access Control)** assigns permissions to roles, then roles to users. A user may have multiple roles; a role may have many permissions. The enforcement check is: `user.roles.some(role => role.permissions.includes(requiredPermission))`.

Three levels of granularity, each progressively more expressive:

1. **Flat RBAC** — roles have permissions; users have roles. Simple. Doesn't scale past ~10 roles.
2. **Hierarchical RBAC** — roles inherit from parent roles (`Teacher` inherits all `Student` permissions). Reduces duplication.
3. **Attribute-Based Access Control (ABAC)** — policies evaluate attributes of user, resource, and environment. Handles "a teacher can only edit their own courses" without creating a role per teacher.

**Where to enforce:** at every layer — middleware for coarse checks (is this user an admin?), service layer for resource-level checks (does this user own this resource?). Relying solely on middleware misses horizontal privilege escalation.

```ts
// types.ts
export type Permission =
  | 'order:create' | 'order:read' | 'order:cancel'
  | 'product:write' | 'product:read'
  | 'user:manage' | 'report:read';

export type Role = 'customer' | 'vendor' | 'admin' | 'support';

// Permission matrix — single source of truth
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  customer:  ['order:create', 'order:read', 'order:cancel', 'product:read'],
  vendor:    ['product:write', 'product:read', 'order:read'],
  support:   ['order:read', 'order:cancel', 'user:manage'],
  admin:     ['order:create', 'order:read', 'order:cancel', 'product:write',
              'product:read', 'user:manage', 'report:read'],
};

// Resolve permissions for a user's roles
export function resolvePermissions(roles: Role[]): Set<Permission> {
  return new Set(roles.flatMap(r => ROLE_PERMISSIONS[r] ?? []));
}
```

```ts
// middleware/authorize.ts — coarse-grained route guard
import { Request, Response, NextFunction } from 'express';
import { resolvePermissions, type Permission, type Role } from '../types';

export function authorize(...required: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as { id: string; roles: Role[] };
    if (!user) return res.status(401).json({ error: 'UNAUTHENTICATED' });

    const perms = resolvePermissions(user.roles);
    const allowed = required.every(p => perms.has(p));
    if (!allowed) return res.status(403).json({ error: 'FORBIDDEN' });
    next();
  };
}

// Route usage
router.post('/orders', authenticate, authorize('order:create'), asyncHandler(createOrder));
router.get('/reports', authenticate, authorize('report:read'), asyncHandler(getReports));

// service layer — resource-level check (ownership)
// Prevents horizontal privilege escalation: user A reading user B's orders
async function getOrder(orderId: string, requesterId: string, requesterRoles: Role[]) {
  const order = await orderRepo.findById(orderId);
  if (!order) throw notFound('ORDER_NOT_FOUND');

  const perms = resolvePermissions(requesterRoles);
  // Admins and support can see any order; customers only their own
  const canRead = perms.has('user:manage') || order.customerId === requesterId;
  if (!canRead) throw forbidden('FORBIDDEN');

  return order;
}
```

```ts
// Unity: 15-module RBAC with module-scoped permissions
// More granular: permissions include the module namespace

type UnityPermission = `${UnityModule}:${Action}`;
type UnityModule = 'courses' | 'assignments' | 'grading' | 'attendance' | '...';
type Action = 'create' | 'read' | 'update' | 'delete' | 'manage';

const UNITY_ROLES: Record<string, UnityPermission[]> = {
  student: ['courses:read', 'assignments:read', 'assignments:create'],
  teacher: ['courses:manage', 'assignments:manage', 'grading:manage', 'attendance:manage'],
  admin:   ['*'], // wildcard — check separately
};
```

## In your project

Unity's 15-module RBAC is the most complex instance: students, teachers, admins, and super-admins interact with courses, assignments, grading, timetables, attendance, fees, and more. Each module defines its own permission set; roles are composed from those sets. The Joi validation layer catches malformed requests; the middleware guard checks roles; the service layer checks resource ownership. Without all three layers, a student who guesses a teacher's assignment ID could read (or modify) another class's graded submissions — middleware alone only blocks the obvious route.

## Tradeoffs & pitfalls

- Hardcoding permissions in middleware (`if (user.role === 'admin')`) creates a maintenance nightmare at 15 modules. The matrix/table pattern makes adding a new role a one-line data change.
- Storing roles in the JWT payload means role changes don't take effect until the token expires. For sensitive role changes (revoking admin), use short-lived tokens or maintain a roles-changed-at timestamp and validate against it.
- Wildcard permissions (`admin: ['*']`) are convenient but make the permission surface opaque. At scale, enumerate even admin permissions — it makes auditing possible.
- RBAC handles coarse access; it struggles with "a vendor can only edit their own products." That requires hybrid RBAC + ownership check in the service layer. Skipping the service-layer check is the source of most horizontal privilege escalation bugs.

## Top-1% insight

The most underused RBAC capability is **permission-based UI rendering** — sending the user's resolved permission set to the frontend so the UI hides buttons the user can't use, rather than showing them and returning 403. This requires the backend to expose a `GET /auth/me` endpoint that returns `{ user, permissions: ['order:create', ...] }`. The frontend derives its visible actions from that set. The backend still enforces every request — UI hiding is convenience, not security. But without it, you get a confusing UX where users see buttons that silently fail, which is a top driver of support tickets in multi-role applications like Unity.
