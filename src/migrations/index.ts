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
import * as migration_20260906_032741_add_governance from './20260906_032741_add_governance';
import * as migration_20260906_041000_cxp_number_uniques from './20260906_041000_cxp_number_uniques';
import * as migration_20260906_053000_add_orders from './20260906_053000_add_orders';
import * as migration_20260906_061500_add_delivery_notes from './20260906_061500_add_delivery_notes';
import * as migration_20260906_070000_add_alerts from './20260906_070000_add_alerts';
import * as migration_20260906_080000_drop_users_password_column from './20260906_080000_drop_users_password_column';
import * as migration_20260906_090000_add_share_tokens from './20260906_090000_add_share_tokens';
import * as migration_20260908_221653_add_sales_config from './20260908_221653_add_sales_config';
import * as migration_20260908_223202_add_tax_config from './20260908_223202_add_tax_config';
import * as migration_20260909_000000_add_email_config from './20260909_000000_add_email_config';
import * as migration_20260909_010000_add_invoice_share_token from './20260909_010000_add_invoice_share_token';
import * as migration_20260909_024148_add_auto_send_invoice_email from './20260909_024148_add_auto_send_invoice_email';
import * as migration_20260910_120000_quote_closure_number_uniques from './20260910_120000_quote_closure_number_uniques';

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
    name: '20260906_030500_add_pricing_vendors',
  },
  {
    up: migration_20260906_032741_add_governance.up,
    down: migration_20260906_032741_add_governance.down,
    name: '20260906_032741_add_governance',
  },
  {
    up: migration_20260906_041000_cxp_number_uniques.up,
    down: migration_20260906_041000_cxp_number_uniques.down,
    name: '20260906_041000_cxp_number_uniques',
  },
  {
    up: migration_20260906_053000_add_orders.up,
    down: migration_20260906_053000_add_orders.down,
    name: '20260906_053000_add_orders',
  },
  {
    up: migration_20260906_061500_add_delivery_notes.up,
    down: migration_20260906_061500_add_delivery_notes.down,
    name: '20260906_061500_add_delivery_notes',
  },
  {
    up: migration_20260906_070000_add_alerts.up,
    down: migration_20260906_070000_add_alerts.down,
    name: '20260906_070000_add_alerts',
  },
  {
    up: migration_20260906_080000_drop_users_password_column.up,
    down: migration_20260906_080000_drop_users_password_column.down,
    name: '20260906_080000_drop_users_password_column',
  },
  {
    up: migration_20260906_090000_add_share_tokens.up,
    down: migration_20260906_090000_add_share_tokens.down,
    name: '20260906_090000_add_share_tokens',
  },
  {
    up: migration_20260908_221653_add_sales_config.up,
    down: migration_20260908_221653_add_sales_config.down,
    name: '20260908_221653_add_sales_config',
  },
  {
    up: migration_20260908_223202_add_tax_config.up,
    down: migration_20260908_223202_add_tax_config.down,
    name: '20260908_223202_add_tax_config',
  },
  {
    up: migration_20260909_000000_add_email_config.up,
    down: migration_20260909_000000_add_email_config.down,
    name: '20260909_000000_add_email_config',
  },
  {
    up: migration_20260909_010000_add_invoice_share_token.up,
    down: migration_20260909_010000_add_invoice_share_token.down,
    name: '20260909_010000_add_invoice_share_token',
  },
  {
    up: migration_20260909_024148_add_auto_send_invoice_email.up,
    down: migration_20260909_024148_add_auto_send_invoice_email.down,
    name: '20260909_024148_add_auto_send_invoice_email'
  },
  {
    up: migration_20260910_120000_quote_closure_number_uniques.up,
    down: migration_20260910_120000_quote_closure_number_uniques.down,
    name: '20260910_120000_quote_closure_number_uniques'
  },
];
