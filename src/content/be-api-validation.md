Validation at the API boundary is the last line of defense against malformed data corrupting your database and business logic — validate shape, type, and domain rules before any handler logic runs.

## The core

The boundary principle: data outside your process is untrusted. `req.body`, `req.params`, `req.query`, and headers all arrive as untyped strings at the HTTP layer. Validation transforms them into typed, constrained values (a DTO — Data Transfer Object) that the rest of your code can safely assume are correct.

A schema library (Joi, Zod, Yup) declares the shape declaratively. Running `schema.parse(input)` does three things atomically:
1. **Coerces** — string `"42"` to number `42` where declared
2. **Validates** — checks constraints (min/max, regex, required)
3. **Strips** — removes undeclared keys (prevents mass-assignment attacks)

**The middleware pattern** — validate once in a reusable middleware, not inline in each route. Failures return 422 with a structured error payload; they never reach the handler.

```ts
// Zod-based validation middleware (Unity-style, TS-first)
import { z, ZodSchema } from 'zod';
import { Request, Response, NextFunction } from 'express';

export function validate<T>(schema: ZodSchema<T>, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(422).json({
        error: 'VALIDATION_ERROR',
        details: result.error.flatten().fieldErrors,
      });
    }
    // Replace with typed, coerced, stripped value
    (req as any)[source] = result.data;
    next();
  };
}

// Define once, use everywhere
const CreateOrderSchema = z.object({
  customerId: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
      })
    )
    .min(1)
    .max(50),
  deliveryAddress: z.object({
    street: z.string().min(5).max(200),
    pincode: z.string().regex(/^\d{6}$/),
  }),
});

export type CreateOrderDTO = z.infer<typeof CreateOrderSchema>; // ← type is derived, not duplicated

// In route
router.post('/orders', validate(CreateOrderSchema), asyncHandler(async (req, res) => {
  const dto = req.body as CreateOrderDTO; // safe — schema already ran
  const order = await orderService.create(dto);
  res.status(201).json({ data: order });
}));
```

```ts
// Joi version — Unity uses Joi, so worth knowing both
import Joi from 'joi';

const createUserSchema = Joi.object({
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().min(8).max(72).required(), // 72 = bcrypt max
  role: Joi.string().valid('student', 'teacher', 'admin').default('student'),
}).options({ stripUnknown: true });  // strips undeclared fields

export function joiValidate(schema: Joi.Schema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(422).json({
        error: 'VALIDATION_ERROR',
        details: error.details.map((d) => ({ field: d.path.join('.'), message: d.message })),
      });
    }
    req.body = value;
    next();
  };
}
```

## In your project

Unity has 38 Mongoose models and 15 modules each with distinct CRUD operations. Joi schemas sit between the HTTP layer and the Mongoose layer. This matters because Mongoose's own validation fires at write time, after your business logic runs — catching bad data there means you may have already charged a payment or sent an email. Joi catches it at the boundary, before any side effect.

## Tradeoffs & pitfalls

- `abortEarly: false` (Joi) / `z.safeParse()` (Zod): always return all errors at once. Returning one error at a time forces the user to submit the form five times.
- Never validate inside business logic or service layers — that layer should receive already-valid data. Mixing concerns means validations run inconsistently.
- The `stripUnknown` / `strip` option prevents mass-assignment: a client sending `{ role: 'admin' }` alongside a signup form gets that field silently removed.
- Regex validation of free-text fields is fragile. Prefer max-length constraints + HTML-encode at render time over trying to sanitize input.
- Password length: bcrypt silently truncates at 72 bytes. Enforce `max(72)` in validation or the `Joi.string().max(72)` rule catches it before it becomes a silent security hole.

## Top-1% insight

Zod's `z.infer<typeof Schema>` eliminates the duplication between your validation schema and your TypeScript type — the schema is the single source of truth. This matters at scale: in Unity's 38-model system, every time a schema changes, the type changes with it, and TypeScript catches every call site that became invalid at compile time rather than at runtime in production. Compare to Joi, which requires manually maintaining a separate TypeScript interface — two things that drift apart over time. For greenfield TypeScript projects, prefer Zod; for existing Joi codebases, adding `@hapi/joi` type guards achieves 80% of the benefit.
