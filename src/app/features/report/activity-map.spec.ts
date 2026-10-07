import { activityColumns, activityLevel } from './activity-map';

describe('mappa dell attività', () => {
  it('fa una colonna per giorno nei periodi brevi', () => {
    const columns = activityColumns('2026-09-30', '2026-10-07');
    expect(columns.map((c) => c.key)).toEqual([
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
    ]);
    // Etichetta sul primo giorno e sui lunedì; sabato e domenica sono weekend
    expect(columns.filter((c) => c.label).map((c) => c.key)).toEqual(['2026-09-30', '2026-10-05']);
    expect(columns.filter((c) => c.weekend).map((c) => c.key)).toEqual([
      '2026-10-03',
      '2026-10-04',
    ]);
  });

  it('passa alle settimane, da lunedì, nei periodi lunghi', () => {
    const columns = activityColumns('2025-10-07', '2026-10-07');
    expect(columns.length).toBe(53);
    // La prima colonna parte dal primo giorno (martedì) e finisce domenica
    expect(columns[0].days).toEqual([
      '2025-10-07',
      '2025-10-08',
      '2025-10-09',
      '2025-10-10',
      '2025-10-11',
      '2025-10-12',
    ]);
    expect(columns[1].key).toBe('2025-10-13');
    expect(columns.flatMap((c) => c.days).length).toBe(366);
  });

  it('assegna i livelli di colore dalle soglie', () => {
    expect([0, 1, 2, 3, 5, 6, 10, 40].map((n) => activityLevel(n, false))).toEqual([
      0, 1, 1, 2, 2, 3, 4, 4,
    ]);
    expect([0, 4, 5, 15, 30].map((n) => activityLevel(n, true))).toEqual([0, 1, 2, 3, 4]);
  });
});
