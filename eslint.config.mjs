// eslint-config-next@16 exporta flat configs nativas (el estilo legacy
// "next/core-web-vitals" vía FlatCompat ya no existe en Next 16).
import coreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      // Nueva regla de eslint-plugin-react-hooks@7 (React Compiler lint). Los
      // modales ERP sincronizan props -> estado en useEffect (patrón estándar
      // "adjusting state when props change"); el refactor a estado derivado/keys
      // es deuda técnica documentada en el PR del Sprint 25, no bloqueo del stack.
      'react-hooks/set-state-in-effect': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: false,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^(_|ignore)',
        },
      ],
    },
  },
  {
    // storellink/ es la referencia heredada (excluida también en tsconfig).
    ignores: ['storellink/', 'src/payload-types.ts', 'src/payload-generated-schema.ts'],
  },
]

export default eslintConfig
