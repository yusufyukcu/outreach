"use client"
import Spline from "@splinetool/react-spline/next"

export function SplineBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <Spline scene="https://prod.spline.design/g9hmS6ul6JvooNH1/scene.splinecode" />
    </div>
  )
}
