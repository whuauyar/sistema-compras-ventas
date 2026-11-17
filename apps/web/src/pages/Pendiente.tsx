import { Construction } from 'lucide-react'
import { Encabezado, Vacio } from '@/components/ui'

/** Módulos de fases siguientes (Compras, Inventario, Gestión). */
export function Pendiente({ titulo, fase }: { titulo: string; fase: string }) {
  return (
    <>
      <Encabezado titulo={titulo} />
      <Vacio icono={<Construction className="size-8" />} titulo="Módulo en construcción" texto={`Se entrega en la ${fase} del plan.`} />
    </>
  )
}
