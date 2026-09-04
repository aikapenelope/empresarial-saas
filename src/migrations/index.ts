import * as migration_20260904_163409_init_core from './20260904_163409_init_core';
import * as migration_20260904_190009_add_finance_crm from './20260904_190009_add_finance_crm';
import * as migration_20260904_195815_add_inventory_bom from './20260904_195815_add_inventory_bom';
import * as migration_20260904_221053_add_accounts_payable from './20260904_221053_add_accounts_payable';

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
    name: '20260904_221053_add_accounts_payable'
  },
];
