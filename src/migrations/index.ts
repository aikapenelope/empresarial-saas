import * as migration_20260904_163409_init_core from './20260904_163409_init_core';

export const migrations = [
  {
    up: migration_20260904_163409_init_core.up,
    down: migration_20260904_163409_init_core.down,
    name: '20260904_163409_init_core'
  },
];
