import { describe, expect, it } from 'vitest';
import { csvCell } from '@/utilities/csv';

describe('csvCell (neutralización de inyección de fórmulas)', () => {
  it.each(['=HYPERLINK("https://evil","x")', '+1+cmd|\'/C calc\'!A0', '-2+5', '@SUM(1)', '=cmd'])(
    'prefija con apóstrofo las celdas que comienzan con carácter de fórmula: %s',
    (value) => {
      const cell = csvCell(value);

      expect(cell.startsWith(`"'`)).toBe(true);
    },
  );

  it('duplica comillas internas (escape CSV estándar)', () => {
    expect(csvCell('Cliente "El Combo"')).toBe('"Cliente ""El Combo"""');
  });

  it('las celdas normales solo se envuelven en comillas', () => {
    expect(csvCell('Almacén Principal')).toBe('"Almacén Principal"');
  });

  it('neutraliza también controles de tabulación y retorno de carro', () => {
    expect(csvCell('\t=SUM(A1)')).toBe('"\'\t=SUM(A1)"');
    expect(csvCell('\r=SUM(A1)')).toBe('"\'\r=SUM(A1)"');
  });
});
