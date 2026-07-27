import { computed, type Ref } from 'vue';
import {
  validateWorkflowModel,
  type WorkflowModel,
  type WorkflowSchemaIssue
} from '@enlearn/workflow-schema';

export function useWorkflowValidation(model: Ref<WorkflowModel>) {
  const issues = computed<WorkflowSchemaIssue[]>(() => validateWorkflowModel(model.value));
  const errors = computed(() => issues.value.filter((issue) => issue.level === 'error'));
  const warnings = computed(() => issues.value.filter((issue) => issue.level === 'warning'));
  const isValid = computed(() => errors.value.length === 0);

  return {
    issues,
    errors,
    warnings,
    isValid
  };
}
