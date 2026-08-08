export type MobileServiceRequest = {
  serviceName: string;
  serviceMethod: string;
  postData: Record<string, unknown>;
};

const legacyAdminListMethodTables: Record<string, string> = {
  listUsers: 'users',
  listRoles: 'admin_roles',
  listPermissions: 'admin_permissions',
  listRoutes: 'admin_routes',
  listRouteTree: 'admin_routes',
  listRouteManageTree: 'admin_routes',
  listEntities: 'admin_entities',
  listPages: 'lowcode_pages',
  listOptionSources: 'system_option_sources',
  listOptionItems: 'system_option_items',
};

const legacyWorkflowListItemTypes: Record<string, string> = {
  listSystemExecutionTasks: 'jobs',
  listWorkflowJobs: 'jobs',
  listWorkflowJobRuns: 'jobRuns',
  listWorkflowTimerJobs: 'jobs',
};

const legacyLowCodeListMethodTables: Record<string, string> = {
  listPages: 'lowcode_pages',
};

const legacyNotificationListResources: Record<string, string> = {
  listMessages: 'notification_messages',
  getPreferences: 'notification_preferences',
  listDeliveries: 'notification_deliveries',
};

const lowCodeTableListMethods = new Set([
  'listTableRows',
  'listRows',
  'listTableData',
]);

const emptyWhenUnavailableListMethods = new Set([
  'listSystemExecutionTasks',
  'listWorkflowTimerJobs',
]);

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function normalizeMobileServiceRequest(
  serviceName: string,
  serviceMethod: string,
  postData: Record<string, unknown>,
): MobileServiceRequest {
  if (serviceName === 'notification' && legacyNotificationListResources[serviceMethod]) {
    return {
      serviceName,
      serviceMethod: 'listItems',
      postData: {
        ...postData,
        resource: readString(postData.resource, legacyNotificationListResources[serviceMethod]),
      },
    };
  }

  if (serviceName === 'files' && serviceMethod === 'listStorageEntities') {
    return {
      serviceName,
      serviceMethod: 'runAction',
      postData: {
        ...postData,
        resource: readString(postData.resource, 'file_objects'),
        operation: readString(
          postData.operation ?? postData.actionName ?? postData.action,
          serviceMethod,
        ),
      },
    };
  }

  if (serviceName === 'admin' && legacyWorkflowListItemTypes[serviceMethod]) {
    const itemType = readString(
      postData.itemType ?? postData.item_type ?? postData.type,
      legacyWorkflowListItemTypes[serviceMethod],
    );
    const rawLimit = Number(postData.limit ?? postData.pageSize ?? postData.page_size);
    const boundedLimit = itemType === 'jobRuns'
      ? Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 50, 100)
      : undefined;
    return {
      serviceName: 'workflow',
      serviceMethod: 'listItems',
      postData: {
        ...postData,
        ...(boundedLimit ? { limit: boundedLimit, pageSize: boundedLimit } : {}),
        ...(serviceMethod === 'listWorkflowTimerJobs'
          ? {
              filters: {
                ...(typeof postData.filters === 'object'
                  && postData.filters !== null
                  && !Array.isArray(postData.filters)
                  ? postData.filters
                  : {}),
                type: 'cron',
              },
            }
          : {}),
        itemType,
      },
    };
  }

  if (serviceName === 'lowcode' && lowCodeTableListMethods.has(serviceMethod)) {
    return { serviceName: 'admin', serviceMethod: 'listItems', postData };
  }

  const tableName = serviceName === 'admin'
    ? legacyAdminListMethodTables[serviceMethod]
    : serviceName === 'lowcode'
      ? legacyLowCodeListMethodTables[serviceMethod]
      : '';
  if (!tableName) return { serviceName, serviceMethod, postData };

  return {
    serviceName,
    serviceMethod: 'listItems',
    postData: {
      ...postData,
      tableName: readString(postData.tableName ?? postData.table_name, tableName),
    },
  };
}

export function shouldReturnEmptyMobileList(error: unknown, originalServiceMethod: string) {
  if (!emptyWhenUnavailableListMethods.has(originalServiceMethod)) return false;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes('Could not find the table')
    || message.includes('Unsupported Admin listItems itemType')
    || message.includes('does not exist')
  );
}
