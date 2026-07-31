import { defineComponent } from 'vue';
function createRemixIcon(name) {
    return defineComponent({
        name,
        setup(_, { attrs }) {
            return () => <i {...attrs} class={[attrs.class, name]} aria-hidden="true"/>;
        }
    });
}
export const ArrowDown = createRemixIcon('ri-arrow-down-s-line');
export const ArrowUp = createRemixIcon('ri-arrow-up-s-line');
export const Aim = createRemixIcon('ri-focus-3-line');
export const BarChart = createRemixIcon('ri-bar-chart-2-line');
export const CaretRight = createRemixIcon('ri-play-fill');
export const CirclePlus = createRemixIcon('ri-add-circle-line');
export const CopyDocument = createRemixIcon('ri-file-copy-line');
export const DArrowLeft = createRemixIcon('ri-arrow-left-double-line');
export const DArrowRight = createRemixIcon('ri-arrow-right-double-line');
export const DataBoard = createRemixIcon('ri-dashboard-3-line');
export const Delete = createRemixIcon('ri-delete-bin-line');
export const Document = createRemixIcon('ri-file-list-3-line');
export const DocumentChecked = createRemixIcon('ri-file-check-line');
export const DocumentCopy = createRemixIcon('ri-file-copy-line');
export const Edit = createRemixIcon('ri-edit-line');
export const FolderOpened = createRemixIcon('ri-folder-open-line');
export const Link = createRemixIcon('ri-link');
export const LinkIcon = createRemixIcon('ri-link');
export const MoreFilled = createRemixIcon('ri-more-fill');
export const Operation = createRemixIcon('ri-node-tree');
export const Picture = createRemixIcon('ri-image-line');
export const Plus = createRemixIcon('ri-add-line');
export const Promotion = createRemixIcon('ri-send-plane-line');
export const QuestionFilled = createRemixIcon('ri-question-line');
export const Rank = createRemixIcon('ri-draggable');
export const Remove = createRemixIcon('ri-remove-circle-line');
export const Suitcase = createRemixIcon('ri-briefcase-4-line');
export const Tickets = createRemixIcon('ri-file-list-3-line');
export const Upload = createRemixIcon('ri-upload-cloud-2-line');
export const VideoPlay = createRemixIcon('ri-play-circle-line');
export const View = createRemixIcon('ri-eye-line');
export const Warning = createRemixIcon('ri-error-warning-line');
export const Cellphone = createRemixIcon('ri-smartphone-line');
export const ChatLineSquare = createRemixIcon('ri-chat-1-line');
export const Download = createRemixIcon('ri-download-line');
export const Position = createRemixIcon('ri-send-plane-line');
export const RefreshLeft = createRemixIcon('ri-arrow-go-back-line');
export const RefreshRight = createRemixIcon('ri-arrow-go-forward-line');
