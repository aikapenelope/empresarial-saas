import * as migration_20260904_163409_init_core from './20260904_163409_init_core';
import * as migration_20260904_190009_add_finance_crm from './20260904_190009_add_finance_crm';

export const migrations = [
  {
    up: migration_20260904_163409_init_core.up,
    down: migration_20260904_163409_init_core.down,
    name: '20260904_163409_init_core',
  },
  {
    up: migration_20260904_190009_add_finance_crm.up,
    down: migration_20260904_190009_add_finance_crm.down,
    name: '20260904_190009_add_finance_crm'
  },
];
