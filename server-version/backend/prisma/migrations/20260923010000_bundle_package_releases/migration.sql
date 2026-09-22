CREATE TABLE "bundle_package_releases" (
  "id" TEXT NOT NULL,
  "bundleKey" TEXT NOT NULL,
  "bundleVersion" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "review" JSONB,
  "installedBy" TEXT NOT NULL,
  "publishedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bundle_package_releases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bundle_package_releases_status_check" CHECK ("status" IN ('DRAFT','PUBLISHED','HOLD','RETIRED'))
);
CREATE UNIQUE INDEX "bundle_package_releases_bundleKey_bundleVersion_key" ON "bundle_package_releases"("bundleKey", "bundleVersion");
