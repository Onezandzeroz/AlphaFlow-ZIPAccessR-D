/**
 * One-time fix script: Update existing companies that incorrectly have isDemo = true
 *
 * Background: The Prisma schema originally had `isDemo Boolean @default(true)`, which
 * meant every company created (including real tenant companies like AlphaAi) got
 * isDemo = true by default. This caused the "Demo-virksomhed" banner and "Demo" badge
 * to appear for all companies, not just the shared demo company.
 *
 * This script:
 *   1. Sets isDemo = false for all companies EXCEPT the shared demo company
 *      (identified by cvrNumber = '29876543' or name = 'Nordisk Erhverv ApS')
 *   2. Sets demoModeEnabled = false for all users who are not currently in the demo company
 *
 * Run with: bun run scripts/fix-isdemo-default.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Fixing isDemo defaults...\n');

  // 1. Find the shared demo company
  const demoCompany = await prisma.company.findFirst({
    where: {
      OR: [
        { cvrNumber: '29876543' },
        { name: 'Nordisk Erhverv ApS' },
      ],
    },
    select: { id: true, name: true },
  });

  const demoCompanyId = demoCompany?.id;
  console.log(`📋 Shared demo company: ${demoCompany ? `"${demoCompany.name}" (${demoCompany.id})` : 'NOT FOUND'}`);

  // 2. Update all non-demo companies to isDemo = false
  const updateResult = await prisma.company.updateMany({
    where: {
      ...(demoCompanyId ? { id: { not: demoCompanyId } } : {}),
      isDemo: true,
    },
    data: {
      isDemo: false,
    },
  });

  console.log(`✅ Updated ${updateResult.count} companies: isDemo = false (real tenant companies)`);

  // 3. Ensure the demo company stays isDemo = true
  if (demoCompanyId) {
    await prisma.company.update({
      where: { id: demoCompanyId },
      data: { isDemo: true },
    });
    console.log(`✅ Confirmed demo company "${demoCompany!.name}" isDemo = true`);
  }

  // 4. Fix user demoModeEnabled — only true if their active company IS the demo company
  const usersInDemo = await prisma.user.findMany({
    where: { demoModeEnabled: true },
    select: {
      id: true,
      email: true,
      demoModeEnabled: true,
      sessions: {
        where: { expiresAt: { gt: new Date() } },
        select: { activeCompanyId: true },
        take: 1,
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  let fixedUsers = 0;
  for (const user of usersInDemo) {
    const activeCompanyId = user.sessions[0]?.activeCompanyId;
    const isInDemoCompany = activeCompanyId === demoCompanyId;

    if (!isInDemoCompany) {
      await prisma.user.update({
        where: { id: user.id },
        data: { demoModeEnabled: false },
      });
      fixedUsers++;
    }
  }

  console.log(`✅ Fixed ${fixedUsers} users: demoModeEnabled = false (not in demo company)`);

  // 5. Summary
  const totalCompanies = await prisma.company.count();
  const demoCompanies = await prisma.company.count({ where: { isDemo: true } });
  const realCompanies = await prisma.company.count({ where: { isDemo: false } });

  console.log(`\n📊 Summary:`);
  console.log(`   Total companies: ${totalCompanies}`);
  console.log(`   Demo companies (isDemo=true): ${demoCompanies}`);
  console.log(`   Real companies (isDemo=false): ${realCompanies}`);
  console.log('\n✨ Done!');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
