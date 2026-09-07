'use client';

import Link from 'next/link';
import { ExternalLinkIcon } from 'lucide-react';

/**
 * Enlace "Abrir Empresarial ERP" en el dashboard del admin de Payload
 * (registrado como componente beforeDashboard). Para los usuarios de la
 * operación el camino normal es el login propio (/login) que los deja
 * directo en su empresa; esto cubre a quien entra por el admin.
 */
export function GoToErpLink() {
	return (
		<div className="mb-4">
			<Link
				href="/"
				className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-card-foreground hover:bg-accent transition-colors"
			>
				<ExternalLinkIcon className="size-4" />
				Abrir Empresarial ERP
			</Link>
		</div>
	);
}
