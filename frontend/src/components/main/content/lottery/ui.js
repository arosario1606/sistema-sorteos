// Clases de Tailwind compartidas por las pantallas de sorteos (usan los tokens primary/accent de la intranet).
export const ui = {
  card: 'mb-5 rounded-lg bg-white p-5 shadow',
  title: 'mb-3 font-semibold text-xl text-primary',
  subtitle: 'mb-2 mt-4 font-semibold text-lg text-gray-800',
  hint: 'text-sm text-gray-600',
  error: 'my-2 text-sm text-red-600',
  success: 'my-2 text-sm font-medium text-accent',
  field: 'flex flex-col gap-1 text-sm text-gray-600',
  input:
    'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary',
  btnPrimary:
    'rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-all duration-300 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  btnAccent:
    'rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-all duration-300 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  btnDanger:
    'rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-all duration-300 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  btnOutline:
    'rounded-md border border-primary bg-white px-4 py-2 text-sm font-medium text-primary transition-all duration-300 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  toolbar: 'my-3 flex flex-wrap items-center gap-3',
  stats: 'my-3 flex flex-wrap gap-6 text-sm text-gray-600',
  tableWrap: 'overflow-x-auto rounded-md border border-gray-200',
  table: 'w-full border-collapse text-left text-sm',
  th: 'bg-sky-50 px-3 py-2 font-semibold text-gray-800',
  td: 'border-t border-gray-100 px-3 py-2',
  center: 'text-center',
}
