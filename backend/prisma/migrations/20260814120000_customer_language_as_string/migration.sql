-- M5 (plan de modularidad): Customer.language deja de ser un enum cerrado
-- {ES,EN,FR} y pasa a texto en minúsculas ("es", "en", "fr", ...), de modo
-- que activar un idioma nuevo sea solo configuración, sin migrar el schema.

ALTER TABLE "Customer"
  ALTER COLUMN "language" DROP DEFAULT,
  ALTER COLUMN "language" TYPE TEXT USING lower("language"::text),
  ALTER COLUMN "language" SET DEFAULT 'es';

DROP TYPE "Language";
