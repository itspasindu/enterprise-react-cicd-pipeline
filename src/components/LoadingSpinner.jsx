function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[45vh] gap-3 animate-fade">
      <div className="relative">
        <div className="h-12 w-12 rounded-full border-[3px] border-slate-200" />
        <div className="absolute inset-0 h-12 w-12 rounded-full border-[3px] border-transparent border-t-blue-600 border-r-teal-500 animate-spin" />
      </div>
      <p className="text-sm font-medium text-slate-500">Loading…</p>
      <span className="sr-only">Loading...</span>
    </div>
  )
}

export default LoadingSpinner
