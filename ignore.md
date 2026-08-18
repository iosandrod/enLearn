 <aside class="print-template-panel">
      <header class="print-template-panel__header">
        <div>
          <h2>打印设计器</h2>
          <span>{{ templates.length }} 个模板</span>
        </div>
        <button type="button" class="print-icon-button" title="刷新模板" aria-label="刷新模板" @click="refreshTemplates">
          <i class="ri-refresh-line" />
        </button>
      </header>

      <div class="print-template-actions">
        <button type="button" class="print-button print-button--primary" @click="saveCurrentTemplate">
          <i class="ri-save-3-line" />
          <span>保存</span>
        </button>
        <button type="button" class="print-button" @click="createBlankTemplate">
          <i class="ri-file-add-line" />
          <span>新建</span>
        </button>
      </div>

      <p v-if="message" :class="messageClass">{{ message }}</p>

      <div class="print-template-list">
        <button
          v-for="template in templates"
          :key="template.id"
          type="button"
          class="print-template-row"
          :class="{ 'is-active': template.id === selectedTemplateId }"
          @click="loadTemplate(template)"
        >
          <span class="print-template-row__name">{{ template.name }}</span>
          <span class="print-template-row__meta">{{ formatTemplateDate(template.updatedAt) }}</span>
        </button>
      </div>

      <div class="print-template-footer">
        <button type="button" class="print-button" :disabled="!selectedTemplate" @click="duplicateSelectedTemplate">
          <i class="ri-file-copy-line" />
          <span>复制</span>
        </button>
        <button type="button" class="print-button print-button--danger" :disabled="!selectedTemplate" @click="deleteSelectedTemplate">
          <i class="ri-delete-bin-line" />
          <span>删除</span>
        </button>
      </div>
    </aside>