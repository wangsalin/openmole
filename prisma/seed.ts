import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const app = await prisma.app.upsert({
    where: { appKey: 'default' },
    update: {},
    create: {
      name: 'Default App',
      appKey: 'default',
      appType: 'ai_saas',
      status: 'active',
      config: { locale: 'zh-CN' },
    },
  });

  const existingRole = await prisma.role.findFirst({
    where: {
      appId: app.id,
      tenantId: null,
      roleKey: 'platform_super_admin',
    },
  });
  const role =
    existingRole ??
    (await prisma.role.create({
      data: {
        appId: app.id,
        roleKey: 'platform_super_admin',
        name: 'Platform Super Admin',
        dataScope: 'platform',
        isBuiltin: true,
      },
    }));

  const email = process.env.DEFAULT_SUPER_ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.DEFAULT_SUPER_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: {
      email,
      passwordHash,
      displayName: 'Platform Admin',
      status: 'active',
    },
  });

  const existingMembership = await prisma.tenantMembership.findFirst({
    where: {
      appId: app.id,
      tenantId: null,
      userId: user.id,
      roleId: role.id,
    },
  });
  if (!existingMembership) {
    await prisma.tenantMembership.create({
      data: {
        appId: app.id,
        userId: user.id,
        roleId: role.id,
        status: 'active',
      },
    });
  }

  const permissions = [
    ['app.read', 'App Read', 'app', 'read'],
    ['app.create', 'App Create', 'app', 'create'],
    ['app.update', 'App Update', 'app', 'update'],
    ['tenant.read', 'Tenant Read', 'tenant', 'read'],
    ['tenant.create', 'Tenant Create', 'tenant', 'create'],
    ['tenant.update', 'Tenant Update', 'tenant', 'update'],
    ['tenant.member.read', 'Tenant Member Read', 'tenant', 'read'],
    ['tenant.member.create', 'Tenant Member Create', 'tenant', 'create'],
    ['tenant.member.update', 'Tenant Member Update', 'tenant', 'update'],
    ['tenant.member.disable', 'Tenant Member Disable', 'tenant', 'disable'],
    ['identity.user.read', 'User Read', 'identity', 'read'],
    ['identity.user.create', 'User Create', 'identity', 'create'],
    ['identity.user.update', 'User Update', 'identity', 'update'],
    ['permission.role.read', 'Role Read', 'permission', 'read'],
    ['permission.role.create', 'Role Create', 'permission', 'create'],
    ['permission.role.update', 'Role Update', 'permission', 'update'],
    ['permission.permission.read', 'Permission Read', 'permission', 'read'],
    ['permission.permission.create', 'Permission Create', 'permission', 'create'],
    ['system.setting.read', 'Setting Read', 'system', 'read'],
    ['system.setting.update', 'Setting Update', 'system', 'update'],
    ['system.dict.read', 'Dict Read', 'system', 'read'],
    ['system.dict.create', 'Dict Create', 'system', 'create'],
    ['billing.feature.read', 'Feature Read', 'billing', 'read'],
    ['billing.feature.create', 'Feature Create', 'billing', 'create'],
    ['billing.feature.update', 'Feature Update', 'billing', 'update'],
    ['billing.plan.read', 'Plan Read', 'billing', 'read'],
    ['billing.plan.create', 'Plan Create', 'billing', 'create'],
    ['billing.plan.update', 'Plan Update', 'billing', 'update'],
    ['billing.subscription.read', 'Subscription Read', 'billing', 'read'],
    [
      'billing.subscription.create',
      'Subscription Create',
      'billing',
      'create',
    ],
    ['billing.order.read', 'Order Read', 'billing', 'read'],
    ['billing.order.create', 'Order Create', 'billing', 'create'],
    ['billing.order.pay', 'Order Pay', 'billing', 'pay'],
    ['usage.ledger.read', 'Usage Ledger Read', 'usage', 'read'],
    ['usage.ledger.create', 'Usage Ledger Create', 'usage', 'create'],
    ['usage.quota.read', 'Usage Quota Read', 'usage', 'read'],
    [
      'usage.entitlement.check',
      'Entitlement Check',
      'usage',
      'check',
    ],
    ['ai.provider.read', 'AI Provider Read', 'ai', 'read'],
    ['ai.provider.create', 'AI Provider Create', 'ai', 'create'],
    ['ai.provider.update', 'AI Provider Update', 'ai', 'update'],
    ['ai.model.read', 'AI Model Read', 'ai', 'read'],
    ['ai.model.create', 'AI Model Create', 'ai', 'create'],
    ['ai.route.create', 'AI Route Create', 'ai', 'create'],
    ['ai.call.read', 'AI Call Read', 'ai', 'read'],
    ['ai.prompt.read', 'Prompt Read', 'ai', 'read'],
    ['ai.prompt.create', 'Prompt Create', 'ai', 'create'],
    [
      'ai.prompt.version.create',
      'Prompt Version Create',
      'ai',
      'create',
    ],
    ['ai.prompt.publish', 'Prompt Publish', 'ai', 'publish'],
    ['developer.api_key.read', 'API Key Read', 'developer', 'read'],
    ['developer.api_key.create', 'API Key Create', 'developer', 'create'],
    ['developer.api_key.disable', 'API Key Disable', 'developer', 'disable'],
    ['developer.webhook.read', 'Webhook Read', 'developer', 'read'],
    ['developer.webhook.create', 'Webhook Create', 'developer', 'create'],
    [
      'developer.webhook.delivery.read',
      'Webhook Delivery Read',
      'developer',
      'read',
    ],
    [
      'developer.webhook.delivery.retry',
      'Webhook Delivery Retry',
      'developer',
      'retry',
    ],
    ['knowledge.base.read', 'Knowledge Base Read', 'knowledge', 'read'],
    ['knowledge.base.create', 'Knowledge Base Create', 'knowledge', 'create'],
    ['knowledge.file.upload', 'Knowledge File Upload', 'knowledge', 'upload'],
    [
      'knowledge.index.rebuild',
      'Knowledge Index Rebuild',
      'knowledge',
      'rebuild',
    ],
  ];

  for (const [permissionKey, name, module, action] of permissions) {
    const permission = await prisma.permission.upsert({
      where: { permissionKey },
      update: {},
      create: { permissionKey, name, module, action },
    });

    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: role.id,
        permissionId: permission.id,
      },
    });
  }

  const tenantRoleTemplates = [
    {
      roleKey: 'tenant_owner',
      name: 'Tenant Owner',
      dataScope: 'tenant',
      permissions: [
        'tenant.read',
        'tenant.update',
        'tenant.member.read',
        'tenant.member.create',
        'tenant.member.update',
        'tenant.member.disable',
        'identity.user.read',
        'permission.role.read',
        'system.setting.read',
        'billing.plan.read',
        'billing.subscription.read',
        'billing.order.read',
        'billing.order.create',
        'billing.order.pay',
        'usage.ledger.read',
        'usage.quota.read',
        'usage.entitlement.check',
        'ai.prompt.read',
        'ai.prompt.create',
        'ai.prompt.version.create',
        'ai.prompt.publish',
        'developer.api_key.read',
        'developer.api_key.create',
        'developer.api_key.disable',
        'developer.webhook.read',
        'developer.webhook.create',
        'developer.webhook.delivery.read',
        'developer.webhook.delivery.retry',
        'knowledge.base.read',
        'knowledge.base.create',
        'knowledge.file.upload',
        'knowledge.index.rebuild',
      ],
    },
    {
      roleKey: 'tenant_admin',
      name: 'Tenant Admin',
      dataScope: 'tenant',
      permissions: [
        'tenant.read',
        'tenant.member.read',
        'tenant.member.create',
        'tenant.member.update',
        'identity.user.read',
        'permission.role.read',
        'billing.plan.read',
        'billing.subscription.read',
        'billing.order.read',
        'billing.order.create',
        'billing.order.pay',
        'usage.quota.read',
        'usage.entitlement.check',
        'ai.prompt.read',
        'ai.prompt.create',
        'ai.prompt.version.create',
        'ai.prompt.publish',
        'developer.api_key.read',
        'developer.webhook.read',
        'developer.webhook.delivery.read',
        'developer.webhook.delivery.retry',
        'knowledge.base.read',
        'knowledge.file.upload',
      ],
    },
    {
      roleKey: 'tenant_member',
      name: 'Tenant Member',
      dataScope: 'own',
      permissions: ['tenant.read'],
    },
    {
      roleKey: 'readonly',
      name: 'Read Only',
      dataScope: 'tenant',
      permissions: ['tenant.read', 'tenant.member.read'],
    },
  ];

  for (const template of tenantRoleTemplates) {
    const existingTemplateRole = await prisma.role.findFirst({
      where: {
        appId: app.id,
        tenantId: null,
        roleKey: template.roleKey,
      },
    });
    const templateRole = existingTemplateRole
      ? await prisma.role.update({
          where: { id: existingTemplateRole.id },
          data: {
            name: template.name,
            dataScope: template.dataScope,
            isBuiltin: true,
            status: 'active',
          },
        })
      : await prisma.role.create({
          data: {
            appId: app.id,
            roleKey: template.roleKey,
            name: template.name,
            dataScope: template.dataScope,
            isBuiltin: true,
            status: 'active',
          },
        });
    const templatePermissions = await prisma.permission.findMany({
      where: { permissionKey: { in: template.permissions } },
    });
    await prisma.rolePermission.createMany({
      data: templatePermissions.map((permission) => ({
        roleId: templateRole.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }

  const features = [
    ['ai_text_generate', 'AI Text Generate', 'ai', true],
    ['knowledge_base', 'Knowledge Base', 'knowledge', true],
    ['file_upload', 'File Upload', 'file', true],
    ['api_access', 'Open API Access', 'developer', true],
    ['webhook_access', 'Webhook Access', 'developer', false],
  ];

  for (const [featureKey, name, module, isMetered] of features) {
    await prisma.feature.upsert({
      where: { featureKey: String(featureKey) },
      update: {},
      create: {
        featureKey: String(featureKey),
        name: String(name),
        module: String(module),
        isMetered: Boolean(isMetered),
      },
    });
  }

  const menus = [
    {
      menuKey: 'dashboard',
      title: 'Dashboard',
      path: '/dashboard',
      icon: 'LayoutDashboard',
      sortOrder: 10,
      permissionKey: 'app.read',
    },
    {
      menuKey: 'app-center',
      title: 'App Center',
      path: '/apps',
      icon: 'Boxes',
      sortOrder: 20,
      permissionKey: 'app.read',
    },
    {
      menuKey: 'tenancy',
      title: 'Tenants',
      path: '/tenants',
      icon: 'Building2',
      sortOrder: 30,
      permissionKey: 'tenant.read',
      children: [
        {
          menuKey: 'tenancy.members',
          title: 'Tenant Members',
          path: '/tenants/members',
          permissionKey: 'tenant.member.read',
          sortOrder: 10,
        },
      ],
    },
    {
      menuKey: 'identity',
      title: 'Identity',
      path: '/identity',
      icon: 'ShieldCheck',
      sortOrder: 40,
      children: [
        {
          menuKey: 'identity.users',
          title: 'Users',
          path: '/identity/users',
          permissionKey: 'identity.user.read',
          sortOrder: 10,
        },
        {
          menuKey: 'identity.roles',
          title: 'Roles',
          path: '/identity/roles',
          permissionKey: 'permission.role.read',
          sortOrder: 20,
        },
        {
          menuKey: 'identity.permissions',
          title: 'Permissions',
          path: '/identity/permissions',
          permissionKey: 'permission.permission.read',
          sortOrder: 30,
        },
      ],
    },
    {
      menuKey: 'billing',
      title: 'Billing',
      path: '/billing',
      icon: 'CreditCard',
      sortOrder: 50,
      permissionKey: 'billing.plan.read',
    },
    {
      menuKey: 'ai-center',
      title: 'AI Center',
      path: '/ai',
      icon: 'Bot',
      sortOrder: 60,
      permissionKey: 'ai.provider.read',
    },
    {
      menuKey: 'developer',
      title: 'Developer',
      path: '/developer',
      icon: 'Code2',
      sortOrder: 80,
      permissionKey: 'developer.api_key.read',
    },
    {
      menuKey: 'knowledge',
      title: 'Knowledge',
      path: '/knowledge',
      icon: 'Library',
      sortOrder: 70,
      permissionKey: 'knowledge.base.read',
    },
    {
      menuKey: 'system',
      title: 'System',
      path: '/system',
      icon: 'Settings',
      sortOrder: 90,
      children: [
        {
          menuKey: 'system.settings',
          title: 'Settings',
          path: '/system/settings',
          permissionKey: 'system.setting.read',
          sortOrder: 10,
        },
        {
          menuKey: 'system.dict',
          title: 'Dictionaries',
          path: '/system/dict',
          permissionKey: 'system.dict.read',
          sortOrder: 20,
        },
        {
          menuKey: 'system.audit',
          title: 'Audit Logs',
          path: '/system/audit-logs',
          permissionKey: 'system.setting.read',
          sortOrder: 30,
        },
      ],
    },
  ];

  const seededMenuIds: string[] = [];
  for (const menu of menus) {
    const parent = await prisma.menu.upsert({
      where: { menuKey: menu.menuKey },
      update: {
        title: menu.title,
        path: menu.path,
        icon: menu.icon,
        sortOrder: menu.sortOrder,
        permissionKey: menu.permissionKey,
        status: 'active',
      },
      create: {
        menuKey: menu.menuKey,
        title: menu.title,
        path: menu.path,
        icon: menu.icon,
        sortOrder: menu.sortOrder,
        permissionKey: menu.permissionKey,
        status: 'active',
      },
    });
    seededMenuIds.push(parent.id);

    for (const child of menu.children ?? []) {
      const childMenu = await prisma.menu.upsert({
        where: { menuKey: child.menuKey },
        update: {
          parentId: parent.id,
          title: child.title,
          path: child.path,
          sortOrder: child.sortOrder,
          permissionKey: child.permissionKey,
          status: 'active',
        },
        create: {
          parentId: parent.id,
          menuKey: child.menuKey,
          title: child.title,
          path: child.path,
          sortOrder: child.sortOrder,
          permissionKey: child.permissionKey,
          status: 'active',
        },
      });
      seededMenuIds.push(childMenu.id);
    }
  }

  for (const menuId of seededMenuIds) {
    await prisma.roleMenu.upsert({
      where: {
        roleId_menuId: {
          roleId: role.id,
          menuId,
        },
      },
      update: {},
      create: {
        roleId: role.id,
        menuId,
      },
    });
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
