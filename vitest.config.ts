import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Socle de tests (QA, P7). Environnement node par défaut ; les tests de composants
// déclarent `// @vitest-environment jsdom` en tête de fichier.
// TZ = Africa/Lagos (UTC+1, sans heure d'été) : les dates sont testées dans les conditions
// des postes du Bénin, du Niger et du Cameroun (D10), où l'UTC donne la veille avant 1 h.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    env: { TZ: 'Africa/Lagos' },
    restoreMocks: true,
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/utils/amount.ts',
        'src/utils/dates.ts',
        'src/utils/phone.ts',
        'src/utils/importRegistrations.ts',
        'src/utils/importReview.ts',
        'src/utils/auth.ts',
        'src/utils/storage.ts',
        'src/utils/audit.ts',
        'src/utils/excelExport.ts',
        'src/components/registrationFormModel.ts',
        'src/components/importReviewModel.ts',
      ],
    },
  },
});
