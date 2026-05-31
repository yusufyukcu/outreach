import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toString()
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount)
}

export function getScoreColor(score: number): string {
  if (score >= 85) return "text-emerald-600"
  if (score >= 70) return "text-green-600"
  if (score >= 55) return "text-yellow-600"
  if (score >= 40) return "text-orange-500"
  return "text-red-500"
}

export function getScoreBg(score: number): string {
  if (score >= 85) return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (score >= 70) return "bg-green-50 text-green-700 border-green-200"
  if (score >= 55) return "bg-yellow-50 text-yellow-700 border-yellow-200"
  if (score >= 40) return "bg-orange-50 text-orange-700 border-orange-200"
  return "bg-red-50 text-red-700 border-red-200"
}

export function getScoreLabel(score: number): string {
  if (score >= 85) return "Hot Lead"
  if (score >= 70) return "Strong Lead"
  if (score >= 55) return "Good Lead"
  if (score >= 40) return "Warm Lead"
  if (score >= 25) return "Weak Lead"
  return "Poor Fit"
}

export function timeAgo(date: string | Date): string {
  const now = new Date()
  const then = new Date(date)
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}
