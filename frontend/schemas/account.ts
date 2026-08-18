import type { LowCodeGridSchema } from '@enlearn/lowcode-framework/types/lowcode';

export const subscriptionGridSchema: LowCodeGridSchema = {
  title: 'Subscription',
  grid: {
    border: true,
    showOverflow: true,
    columns: [
      { field: 'label', title: 'Field', width: 180 },
      { field: 'value', title: 'Value', minWidth: 220 }
    ]
  }
};
