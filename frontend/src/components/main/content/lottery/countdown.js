// Número que muestra la cuenta regresiva del sorteo: enteros, desde floor(duración) hasta 1, sin pasar por 0.
// Con 3,5 s de duración muestra 3 durante 1,5 s (3,5 s → 2 s), luego 2 durante 1 s y 1 durante el último segundo:
// la duración total no cambia, solo se reparte el medio segundo sobrante en el primer número.
export function countdownNumber(timeLeftMs, totalMs) {
  const start = Math.floor(totalMs / 1000)
  return Math.max(1, Math.min(start, Math.ceil(timeLeftMs / 1000)))
}
