function clickHandler(binding, router) {
	return function onClick(e) {
		if (e.defaultPrevented) return

		// When the element is clicked, activate the new route (push or replace)
		if (binding.arg === 'replace') router.replace(binding.value)
		else router.push(binding.value)
	}
}

const vRouteTo = {
	mounted(el, binding, vnode) {
		// Create a click handler
		const boundClickHandler = clickHandler(
			binding,
			vnode.ctx.appContext.app.config.globalProperties.$router
		)

		// Store the click handler in the element so that it can be accessed when unmoounting the composant
		el._vRouteToHandler = boundClickHandler

		// Attach the click handler to the target element
		el.addEventListener('click', boundClickHandler)
	},
	unmounted(el) {
		// Unregister the click handler
		if (el._vRouteToHandler) {
			el.removeEventListener('click', el._vRouteToHandler)
			delete el._vRouteToHandler
		}
	},
	updated(el, binding, vnode) {
		// Unregister the old handler
		if (el._vRouteToHandler) {
			el.removeEventListener('click', el._vRouteToHandler)
		}

		// Create a new click handler with the updated binding
		const boundClickHandler = clickHandler(
			binding,
			vnode.ctx.appContext.app.config.globalProperties.$router
		)

		// Store the click handler in the element so that it can be accessed when unmoounting the composant
		el._vRouteToHandler = boundClickHandler

		// Attach the click handler to the target element
		el.addEventListener('click', boundClickHandler)
	},
}

export default vRouteTo
