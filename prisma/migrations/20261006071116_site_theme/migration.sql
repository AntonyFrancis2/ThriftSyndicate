-- CreateTable
CREATE TABLE "SiteTheme" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "colors" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteTheme_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SiteTheme" ADD CONSTRAINT "SiteTheme_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
