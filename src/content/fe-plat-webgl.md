WebGL hands the browser's GPU a buffer of vertices and two shader programs written in GLSL; the GPU runs the vertex shader once per vertex and the fragment shader once per pixel in parallel, producing millions of colored pixels per frame — work that would take hundreds of milliseconds on the CPU.

## The core

The WebGL pipeline: JavaScript uploads **geometry** (vertex buffer) and **programs** (shaders) to the GPU once. Each frame, JavaScript issues **draw calls** that tell the GPU to process the buffers through the program and write results to the framebuffer. The browser composites the framebuffer onto the page.

**Vertex shader**: runs once per vertex. Transforms 3D world coordinates to 2D clip space. Outputs `gl_Position` and any interpolated data (UV coordinates, normals) passed to the fragment shader.

**Fragment shader**: runs once per rasterized pixel. Receives interpolated data from the vertex shader. Outputs `gl_FragColor` — the RGBA color of that pixel.

```glsl
// Vertex shader (GLSL ES 1.0 — WebGL 1)
attribute vec3 aPosition;
attribute vec2 aUV;
uniform mat4 uModelViewProjection;
varying vec2 vUV;

void main() {
  vUV = aUV;
  gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
}

// Fragment shader — renders a gradient based on UV coordinates
precision mediump float;
varying vec2 vUV;
uniform float uTime;

void main() {
  vec3 color = vec3(vUV.x, vUV.y, abs(sin(uTime)));
  gl_FragColor = vec4(color, 1.0);
}
```

Three.js abstracts the raw WebGL calls into a scene graph. The mental model remains the same — geometry (vertices), material (shader + uniforms), mesh (geometry + material). The `renderer.render(scene, camera)` call translates to one or more WebGL draw calls.

```tsx
import * as THREE from 'three'
import { useEffect, useRef } from 'react'

function WebGLCanvas() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(mountRef.current!.clientWidth, mountRef.current!.clientHeight)
    mountRef.current!.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000)
    camera.position.z = 5

    const geometry = new THREE.IcosahedronGeometry(2, 4)
    const material = new THREE.MeshStandardMaterial({
      color: '#6EE7F9',
      wireframe: true,
    })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)
    scene.add(new THREE.AmbientLight(0xffffff, 0.8))

    let animId: number
    const animate = (t: number) => {
      animId = requestAnimationFrame(animate)
      mesh.rotation.x = t * 0.0005
      mesh.rotation.y = t * 0.001
      renderer.render(scene, camera)
    }
    animId = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animId)
      renderer.dispose()
      geometry.dispose()
      material.dispose()
    }
  }, [])

  return <div ref={mountRef} style={{ width: '100%', height: '400px' }} />
}
```

**Draw calls** are the main performance bottleneck. Each `renderer.render` call for a distinct material/geometry combination issues one draw call. Hundreds of draw calls per frame degrade performance. The solution is **instancing** (`THREE.InstancedMesh`) — one draw call renders thousands of identical geometries with different transforms.

## In your project

Your Portfolio's background uses Three.js for animated 3D elements. gharKa's landing page uses a Three.js particle system for visual depth. In both cases, the critical discipline is cleanup: `renderer.dispose()`, `geometry.dispose()`, `material.dispose()` in the effect cleanup prevent GPU memory leaks across React hot reloads and route changes. A leaked WebGL context eventually causes `CONTEXT_LOST_WEBGL` errors.

## Tradeoffs & pitfalls

- **Canvas resolution vs CSS size**: setting canvas width/height equal to CSS size ignores device pixel ratio. On a 2× display, everything is blurry. Multiply by `window.devicePixelRatio` and set `renderer.setPixelRatio(devicePixelRatio)`.
- **Texture memory**: each texture uploaded to the GPU occupies GPU VRAM. Dispose of textures you no longer need with `texture.dispose()`. Loading many high-resolution textures without disposal will exhaust VRAM and crash the WebGL context.
- **WebGL context limit**: browsers limit the number of simultaneous WebGL contexts per page (typically 8–16). Each `new THREE.WebGLRenderer()` creates one. Unmounting a React component without calling `renderer.dispose()` leaks a context.

## Top-1% insight

Three.js's `renderer.render(scene, camera)` is synchronous from JavaScript's perspective, but the actual GPU work is **asynchronous** — the CPU queues commands in a command buffer and the GPU executes them. This means the rAF callback returns before the frame has been displayed. If you read back GPU data (e.g., `renderer.readRenderTargetPixels()`), you force a CPU-GPU synchronization stall — the CPU waits for the GPU to finish. This is why GPU readback in a render loop is catastrophic for performance. For picking (hit-testing objects with a mouse click), use CPU-side raycasting (`THREE.Raycaster`) instead of GPU readback.
