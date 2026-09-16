'use client';

import React from 'react';
import { MessageCircle } from 'lucide-react';
import { buildStorefrontContactWhatsAppUrl } from '@/utilities/storefrontQuotes';
import type { StorefrontTenantInfo } from './types';

interface StorefrontFloatingWhatsAppProps {
  tenant: StorefrontTenantInfo;
}

export const StorefrontFloatingWhatsApp: React.FC<StorefrontFloatingWhatsAppProps> = ({
  tenant,
}) => {
  const targetPhone = tenant.whatsappOrdersNumber || tenant.phone;
  const whatsappUrl = buildStorefrontContactWhatsAppUrl(targetPhone, tenant.name);

  if (!whatsappUrl) {
    return null;
  }

  return (
    <aside
      aria-label="Atención al cliente por WhatsApp"
      className="fixed bottom-6 right-6 z-40 print:hidden"
    >
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-2.5 rounded-full border border-emerald-500/40 bg-emerald-600 px-4 py-3 text-white shadow-lg transition-all duration-300 hover:bg-emerald-500 hover:shadow-xl hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2"
        aria-label={`Contactar por WhatsApp a ${tenant.name}`}
      >
        <MessageCircle className="h-5 w-5 fill-current stroke-[1.5]" />
        <span className="hidden sm:inline text-xs font-semibold tracking-wide">
          ¿Dudas? Escríbenos
        </span>
      </a>
    </aside>
  );
};
