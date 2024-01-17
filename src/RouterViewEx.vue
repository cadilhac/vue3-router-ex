<template>
    <div class="h-100">
        <router-view :name="name" v-slot="{ Component, route }">
            <Transition :name="transition ?? ''">
                <component :is="component ?? Component" v-bind="route.meta.props" />
            </Transition>
        </router-view>
    </div>
</template>

<script setup>
import { watch } from 'vue';
import { shallowRef } from 'vue';
import { useRoute } from 'vue-router';

const props = defineProps(['name', 'transition'])

const route = useRoute()

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