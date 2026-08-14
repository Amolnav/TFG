-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "photoUrl" TEXT;
