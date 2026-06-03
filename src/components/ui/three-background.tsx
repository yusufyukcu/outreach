"use client"
import { useEffect, useRef } from "react"

export function ThreeBackground() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    let animationId: number

    async function init() {
      const THREE = await import("three")
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js")
      const { default: SplineLoader } = await import("@splinetool/loader")

      const container = containerRef.current!
      const w = window.innerWidth
      const h = window.innerHeight

      // Camera
      const camera = new THREE.OrthographicCamera(w / -2, w / 2, h / 2, h / -2, -50000, 10000)
      camera.position.set(0, 0, 0)
      camera.quaternion.setFromEuler(new THREE.Euler(0, 0, 0))

      // Scene
      const scene = new THREE.Scene()
      scene.background = new THREE.Color("#000000")

      // Load Spline scene
      const loader = new SplineLoader()
      loader.load("https://prod.spline.design/KXCt1GRGC1pGyWMc/scene.splinecode", (splineScene) => {
        scene.add(splineScene)
      })

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setSize(w, h)
      renderer.setPixelRatio(window.devicePixelRatio)
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFShadowMap
      renderer.setClearAlpha(1)
      container.appendChild(renderer.domElement)

      // Controls
      const controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.125

      // Resize
      function onResize() {
        const nw = window.innerWidth
        const nh = window.innerHeight
        camera.left = nw / -2
        camera.right = nw / 2
        camera.top = nh / 2
        camera.bottom = nh / -2
        camera.updateProjectionMatrix()
        renderer.setSize(nw, nh)
      }
      window.addEventListener("resize", onResize)

      // Animate
      function animate() {
        animationId = requestAnimationFrame(animate)
        controls.update()
        renderer.render(scene, camera)
      }
      animate()

      // Cleanup
      return () => {
        window.removeEventListener("resize", onResize)
        cancelAnimationFrame(animationId)
        renderer.dispose()
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement)
        }
      }
    }

    const cleanup = init()
    return () => {
      cleanup.then((fn) => fn?.())
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ width: "100vw", height: "100vh" }}
    />
  )
}
