import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const providers = [
  {
    providerKey: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    secretRef: 'env:DEEPSEEK_API_KEY',
    modelKey: 'deepseek-v4-flash',
    modelName: 'DeepSeek V4 Flash',
    routeKey: 'deepseek-chat',
  },
  {
    providerKey: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.io/v1',
    secretRef: 'env:MINIMAX_API_KEY',
    modelKey: 'MiniMax-M2.7',
    modelName: 'MiniMax M2.7',
    routeKey: 'minimax-chat',
  },
];

async function main() {
  const app = await prisma.app.findUnique({ where: { appKey: 'default' } });
  if (!app) {
    throw new Error('Default app not found. Run npm run prisma:seed first.');
  }

  for (const item of providers) {
    const provider = await prisma.aiProvider.upsert({
      where: { providerKey: item.providerKey },
      update: {
        name: item.name,
        baseUrl: item.baseUrl,
        secretRef: item.secretRef,
        status: 'active',
      },
      create: {
        providerKey: item.providerKey,
        name: item.name,
        baseUrl: item.baseUrl,
        secretRef: item.secretRef,
        status: 'active',
      },
    });

    const model = await prisma.aiModel.upsert({
      where: {
        providerId_modelKey: {
          providerId: provider.id,
          modelKey: item.modelKey,
        },
      },
      update: {
        name: item.modelName,
        modality: 'text',
        status: 'active',
      },
      create: {
        providerId: provider.id,
        modelKey: item.modelKey,
        name: item.modelName,
        modality: 'text',
        status: 'active',
      },
    });

    const existingRoute = await prisma.aiModelRoute.findFirst({
      where: {
        appId: app.id,
        tenantId: null,
        routeKey: item.routeKey,
      },
    });
    if (existingRoute) {
      await prisma.aiModelRoute.update({
        where: { id: existingRoute.id },
        data: {
          primaryModelId: model.id,
          status: 'active',
        },
      });
    } else {
      await prisma.aiModelRoute.create({
        data: {
          appId: app.id,
          routeKey: item.routeKey,
          primaryModelId: model.id,
          status: 'active',
        },
      });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
