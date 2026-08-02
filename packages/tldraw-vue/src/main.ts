import { createApp } from 'vue'
import VxeUI from 'vxe-pc-ui'
import VxeUITable from 'vxe-table'
import App from './App.vue'
import './styles.css'

createApp(App)
	.use(VxeUI)
	.use(VxeUITable)
	.mount('#app')
