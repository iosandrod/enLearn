import {
  Fragment,
  defineComponent,
  onBeforeUnmount,
  onMounted,
} from 'vue';
import { VxeDrawer } from 'vxe-pc-ui';
import {
  closeGlobalDrawer,
  createGlobalDrawerContext,
  globalDrawerInstances,
  isActiveGlobalDrawerHost,
  registerGlobalDrawerHost,
} from '../runtime/global-drawer-core';

export default defineComponent({
  name: 'GlobalDrawerHost',
  setup() {
    const VxeDrawerComponent = VxeDrawer as any;
    const host = registerGlobalDrawerHost();

    const handleEscape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        !isActiveGlobalDrawerHost(host.hostId) ||
        !globalDrawerInstances.length
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      const instance = globalDrawerInstances[globalDrawerInstances.length - 1];
      void closeGlobalDrawer(instance.id, 'escape');
    };

    onMounted(() => window.addEventListener('keydown', handleEscape, true));
    onBeforeUnmount(() => {
      window.removeEventListener('keydown', handleEscape, true);
      host.unregister();
    });

    return () => {
      if (!isActiveGlobalDrawerHost(host.hostId)) return null;

      return (
        <Fragment>
        {globalDrawerInstances.map((instance) => {
          const config = instance.config;
          const drawerProps = {
            modelValue: instance.visible,
            title: config.title ?? '',
            width: config.width ?? 'min(460px, calc(100vw - 24px))',
            height: config.height,
            position: config.position ?? 'right',
            className: config.className,
            transfer: true,
            mask: false,
            lockView: false,
            lockScroll: false,
            showFooter: false,
            showClose: true,
            resize: true,
            destroyOnClose: true,
            padding: false,
            escClosable: false,
            zIndex: 10000 + globalDrawerInstances.indexOf(instance),
            ...(config.props ?? {}),
            'onUpdate:modelValue': (visible: boolean) => {
              if (!visible) void closeGlobalDrawer(instance.id, 'close');
              else instance.visible = true;
            },
            onClose: (event: { type?: string }) => {
              void closeGlobalDrawer(instance.id, event.type || 'close');
            },
          };

          return (
            <VxeDrawerComponent
              key={instance.id}
              {...drawerProps}
              v-slots={{
                default: () => config.body(createGlobalDrawerContext(instance)),
              }}
            />
          );
        })}
        </Fragment>
      );
    };
  },
});
