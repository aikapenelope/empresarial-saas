import * as migration_20260904_163409_init_core from './20260904_163409_init_core';
import * as migration_20260904_190009_add_finance_crm from './20260904_190009_add_finance_crm';
import * as migration_20260904_195815_add_inventory_bom from './20260904_195815_add_inventory_bom';
import * as migration_20260904_221053_add_accounts_payable from './20260904_221053_add_accounts_payable';
import * as migration_20260904_224151_add_cash_registers from './20260904_224151_add_cash_registers';
import * as migration_20260904_225525_add_industry_templates from './20260904_225525_add_industry_templates';
import * as migration_20260905_203000_document_number_uniques from './20260905_203000_document_number_uniques';
import * as migration_20260905_224331_add_sale_inventory from './20260905_224331_add_sale_inventory';
import * as migration_20260906_023548_add_quotes from './20260906_023548_add_quotes';
import * as migration_20260906_030500_add_pricing_vendors from './20260906_030500_add_pricing_vendors';

export const migrations = [
  {
    up: migration_20260904_163409_init_core.up,
    down: migration_20260904_163409_init_core.down,
    name: '20260904_163409_init_core',
  },
  {
    up: migration_20260904_190009_add_finance_crm.up,
    down: migration_20260904_190009_add_finance_crm.down,
    name: '20260904_190009_add_finance_crm',
  },
  {
    up: migration_20260904_195815_add_inventory_bom.up,
    down: migration_20260904_195815_add_inventory_bom.down,
    name: '20260904_195815_add_inventory_bom',
  },
  {
    up: migration_20260904_221053_add_accounts_payable.up,
    down: migration_20260904_221053_add_accounts_payable.down,
    name: '20260904_221053_add_accounts_payable',
  },
  {
    up: migration_20260904_224151_add_cash_registers.up,
    down: migration_20260904_224151_add_cash_registers.down,
    name: '20260904_224151_add_cash_registers',
  },
  {
    up: migration_20260904_225525_add_industry_templates.up,
    down: migration_20260904_225525_add_industry_templates.down,
    name: '20260904_225525_add_industry_templates',
  },
  {
    up: migration_20260905_203000_document_number_uniques.up,
    down: migration_20260905_203000_document_number_uniques.down,
    name: '20260905_203000_document_number_uniques',
  },
  {
    up: migration_20260905_224331_add_sale_inventory.up,
    down: migration_20260905_224331_add_sale_inventory.down,
    name: '20260905_224331_add_sale_inventory',
  },
  {
    up: migration_20260906_023548_add_quotes.up,
    down: migration_20260906_023548_add_quotes.down,
    name: '20260906_023548_add_quotes',
  },
  {
    up: migration_20260906_030500_add_pricing_vendors.up,
    down: migration_20260906_030500_add_pricing_vendors.down,
    name: '20260906_030500_add_pricing_vendors'
  },
];
