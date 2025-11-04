<template>
	<router-view :name="name" v-slot="{ Component, route }">
		<Transition v-if="transition" :name="transition">
			<component :is="component ?? Component" v-bind="route.meta.props" v-model:routeState="state" />
		</Transition>
		<component v-else :is="component ?? Component" v-bind="route.meta.props" v-model:routeState="state" />
	</router-view>
</template>

<script setup>
import { ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const state = ref({})

const props = defineProps(['name', 'transition'])

const route = useRoute()
const router = useRouter()

// Create a custom prop on the route that will store our reactive route's history state
router.vue3RouterEx = { historyState: state }

const component = shallowRef(null)

watch(route, routeValue => {
	let componentForView

	try {
		// Find the component to use, starting from the lower matched route, going up the ancestors
		routeValue.matched.toReversed().some(r => {
			componentForView = (typeof r.meta?.components === 'function' ?
				r.meta?.components?.(props.name, routeValue) :
				r.meta?.components?.[props.name]) ?? r.components?.[props.name]
			if (componentForView) return true
		})

		if (typeof componentForView === 'function')
			componentForView = componentForView(routeValue)

		// If the component is defined as a function for lazy loading: () => import('......')
		if (componentForView instanceof Promise) {
			componentForView.then(result => {
				component.value = result.default
			})
		}
		else {
			component.value = componentForView
		}
	}
	catch (err) {
		console.log(err)
	}
}, { immediate: true })

</script>

<style scoped>
.vre-fade-enter-active,
.vre-fade-leave-active {
	transition: opacity 0.1s ease;
}

.vre-fade-enter-from,
.vre-fade-leave-to {
	opacity: 0;
}
</style>
