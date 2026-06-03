"use client"
import Spline from "@splinetool/react-spline/next"

export function SplineBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 w-full h-full">
      <Spline
        scene="https://prod.spline.design/KXCt1GRGC1pGyWMc/scene.splinecode"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  )
}
