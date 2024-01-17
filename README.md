# Introduction

I created this library while learning Vue in the process of porting an existing web app ([Coludik](https://coludik.com) which allows board game players to share their own games and borrow those of others) from AngularJS to Vue 3. I was making extensive use of the power of [ui-router](https://github.com/angular-ui/ui-router), a state-based router that defines itself like so:

> UI-Router applications are modeled as a hierarchical tree of states. UI-Router provides a state machine to manage the transitions between those application states in a transaction-like manner.

Used to using this specificity of ui-router, I very quickly came across some Vue Router's limitations: it's impossible to define pathless routes that represent different possible states for the same path; out of the box, it's impossible for a deep route to fill a named view that's higher in the tree than its parent; nor is there a well-defined way of declaring the set of data you need to load for a route; and finally, it's also not easy to lazy load different templates targeting different named views depending on a criterion (such as being on a mobile or a computer).

# Features

With vue3-router-ex, you can enhance a route definition to:

1. Indicate which data you require. To validate a route, all data must first be loaded (usually asynchronously) and it can be done hierarchically (i.e. some data can depend on others, coming from the current or an ancestor route).
2. Redirect to another route if needed. You don't need to load all the data first, just the one you need to choose to redirect or not.
3. Implicitly define states by choosing which data subset to load according to a criterion (usually a first discriminating data) and which components to assign to named views (based on the data or another criterion like being on a mobile or not). These components can be placed anywhere higher in the hierarchy of routed components by using a custom `router-view-ex` directive which seamlessly replaces `router-view`.
4. Hook into the Vue Router guards.

vue3-router-ex also ensures that component props (the ones you get with `defineProps`) include:

1. The route parameters.
2. All the (often fetched) data (see [resolves](#resolves)) set in the route definition.
3. Some variables that are not part of the route url (i.e. not in params or query). It uses windows.history.state to pass these variables.

# Installation and general setup

Add this library to your existing Vue 3 project:

```
npm install @cadilhac/vue3-router-ex
```

In your main javascript file:

```javascript
import { plugin as vueRouterEx } from '@cadilhac/vue3-router-ex'
import '@cadilhac/vue3-router-ex/styles'    // Only if you use the optional fade transition

// [...]

app.use(router)
app.use(vueRouterEx, {
    router,
    globalerrorHandler: () => {
        // An example of what to do with an exception coming from the plugin itself:

        // Show an error message
        toast.error('An unknown error has occured. Please, contact the administrator for support.')

        // Redirect to your main route
        return { name: 'home' }
    }
})

// [...]
```

Note that you only need to import the styles if you use the [optional fade transition](#transition) supplied with the plugin.

# Route definitions

When dealing with route definitions, everything lies in [the power of the meta](https://router.vuejs.org/guide/advanced/meta.html). Here is the skeleton of a route definition embracing all vue3-router-ex benefits:

```javascript
const routes = [{
    // Avoid adding a 'children' property in your routes. Instead use a 'parent' property (vue3-router-ex specific feature).
    // It's a lot clearer and allows splitting routes, each one (or related ones) in its own file.
    parent: 'someParent',
    name: 'someName',
    path: 'somePath',
    component: {},  // An empty component property to avoid a Vue Router warning.
    meta: {
        resolve: {
        },
        resolveFilter: async function (resolver, transition) {
        },
        components: (viewName, route) => {
        },
        redirectTo: async function (resolver, transition) {
        },
        beforeEnterBegin: async function (to, from) {
        },
        beforeEnterEnd: async function (to, from, failure) {
        },
        afterEnter: async function (to, from, failure) {
        },
        // All othe meta fields you need, for instance:
        // requiresAuth: true
    }
    // Don't add a props property. The plugin will take care of adding a custom one.
},
{
    // Another route
}]
```

Before going into the meat of this, the route definitions must pass through the plugin and it will take care of actually adding them to the router (in the correct order to respect parent/child relationships). This is done with the `useRoutesLoader` function. Here is an example of the file where the router is created:

```javascript
import { createRouter, createWebHistory } from 'vue-router'
import { useRoutesLoader } from '@cadilhac/vue3-router-ex'

// Route definitions are written in separate files
import routeDefinitions from './routedefinitions'

const router = createRouter({
  history: createWebHistory(),
  routes: []
})

// routeDefinitions can be an array of routes or an array of arrays of routes
const routesBuilder = useRoutesLoader(router, routeDefinitions)

export default router
```

In case you are wondering, the routedefinitions folder in the example has an index.js file that collects all files that define routes:

```javascript
import user from './user.js'
import dashboard from './dashboard.js'
import settings from './settings.js'

export default [
    user,
    dashboard,
    settings
]
```

# Resolves

If you come, like me, from the AngularJS/ui-router world, then you know what resolves are. The author defines this as:

> The resolve subsystem is an asynchronous, hierarchical Dependency Injection system.

Said otherwise, resolves are data you want to load and that are a prerequisite to the route being targeted. If you want to load from the server a user profile object and the user does not exist in the database, then you can't go to the profile route. Instead, typically, you will be redirected to another route and an error message will be displayed.

## Resolve definitions

Here is a resolve example:

```javascript
meta: {
    resolve: {
        game: ['$transition$', function ($transition$) {
            const personalGameService = usePersonalGameService()
            return personalGameService.getGame($transition$.to.params.id).then(
                function (game) {
                    return game;
                });
        }],
        pageTitle: ['game', function (game) {
            return {
                'fr': 'Prêt de ' + game.name,
                'en': 'Sharing ' + game.name
            }
        }]
    }
}
```

`resolve` is an object whose key/value pairs each correspond to the name of a data and a function (or an array whose last item is a function) that returns either its value or a Promise. In both cases, it can have a list of arguments which are considered dependencies, each dependency being another value or promise, either defined in the current route or in a parent route.  
As you can see, there are two resolves here: `game` and `pageTitle`. In the case of `game`, the `$transition$` dependency is a special one. It is handled by the plugin and is simply an object containing the 'from' and 'to' routes, i.e. `{ to, from }`. You don't need to define this resolve. It will always be here for you. The body of the `game` function is a classic async call to the server. In the case of `pageTitle`, the argument is `game` and it returns a localized string containing the game name (better to use i18n here).

Your resolves can be defined in any order. The plugin takes care of handling them in the correct order.

Note that both resolves are not just a function, like:

```javascript
pageTitle: function (game) {
    return {
        'fr': 'Prêt de ' + game.name,
        'en': 'Sharing ' + game.name
    }
}
```

Instead, we have to use a trick (an array of the argument names and the function itself as the last argument) that will make this injection mechanism survive the minification step when we build for production. Without it, the argument names would be changed and the injection mechanism would not know what they mean. This trick is taken from the AngularJS code itself. If there are no dependencies, you can use a simple function instead of an array.

# Component props

When a component is loaded for an activated route, you can normally use `defineProps` to get the parameters that are defined on the route. This is what Vue Router already offers.

```javascript
// With this route definition:
const routes = [{
  name: 'user',
  path: 'user/:id',
  // [...]
}]

// You can write in your component:
const props = defineProps(['id'])
```

This plugin adds more data to the props you can get.

1. Resolves: each resolve you have defined in your route will be available here. In the example given in the previous section, you can write in your component:

    ```javascript
    const props = defineProps(['game', 'pageTitle'])
    ```

2. Custom parameters: with Vue Router, you can pass some values that are not part of a route url by adding a state property to your `push` call argument. If you need them to be part of component props, use a `props` property inside this state property:

    ```javascript
    router.push({
        name: 'registerStep2',
        state: {
            props: {
                location
            }
        }
    })

    // You can then use in your component:
    const props = defineProps(['location'])
    ```
    
This implies that resolves, custom parameters and route parameters must have distinct names.

# Route states

Contrarily to ui-router for AngularJs, Vue Router is not a [state router](https://ui-router.github.io/guide/states), which means you can't have several route definitions that have the same path (either siblings or parent/child). The goal here is to simulate these states by letting the route definition specify a set of resolves and a set of components to use depending on some custom criteria. In Coludik, the game you load for a specific url may be a game you share or a game you have borrowed. These are 2 different states that demand different resolves and display different components (UI, i.e. templates, and code) in the named views.

## Filtering resolves

The magic of the resolves is that they are not eagerly loaded up front. A data structure is prepared so that the plugin knows how to load them and in which order but it differs the actual loading until you actually need it.

Once this data structure has been built, and after you had a chance to redirect to another route (see later), the plugin gives you the possibility to say that you are in a certain state and that you need a subset only of the declared resolves. It's like going to another route that declares only this subset while keeping the same path. You do that with the `meta.resolveFilter` property.

Here is an example:

```javascript
meta: {
    resolveFilter: async function (resolver, transition) {
        const game = await resolver.game

        if (game.isMine)
            return ['game', 'pageTitle', 'borrower']
        else if (game.isBorrowed)
            return ['game', 'pageTitle', 'ownerUser', 'personalGamesPrefs', 'discussion']
    }
}
```

`resolveFilter` is a function that returns an array of the subset of resolves you need after you establish that your app is in a certain state. At this stage, instead of giving to you all the resolved data, it only gives you an object (`resolver`) that knows how to load the needed data. In the example, I needed only the game to know if it is my game that is in an available state or if this is one that I borrowed from someone else. The resolver is a kind of proxy so you just append the data you need to it and place an await in front and you will get your data. A transition `{to, from}` is also passed to the function in case you need it as well.

## Components

Once you know your state, or if you simply have no specific states at all, you are given a way to assign some components anywhere inside named views of the ancestor component templates. This has two aspects: a new directive for views and component definitions in the route definition.

In order to place your components in named views, you have to use a new directive called `router-view-ex`, like so:

```html
<router-view-ex name="MainContent"></router-view-ex>
```

Pretty straightforward. This custom `router-view` knows how to search for the components you define in the meta of your route definitions with the `components` property. `components` can be an object or a function. In the first case, the keys of the object are view names and the values are either a function taking the current route as the single argument or a component (which is the same as using the core `components` property in a route definition):

```javascript
meta: {
    components: {
        'app': (route) => {
            const responsiveHelper = useResponsiveHelperStore()
            return responsiveHelper.isPhone ?
                import('../views/Platform.phone.vue') :
                import('../views/Platform.vue')
        }
    }
}
```

In the second case, the function receives the view name and the route (for access to your route data for instance) in arguments:

```javascript
meta: {
    components: (viewName, route) => {
        const game = route.meta.props.game

        if (game.isMine) {
            if (viewName === 'MainContent')
                return () => import('../views/MyPersonalGame.vue')
        }
        else if (game.isBorrowed) {
            if (viewName === 'MainContent')
                return () => import('../views/BorrowedGame.vue')
        }
    }
}
```

There is no resolver this time because, at this stage, all your filtered resolves have been loaded and they are available in `route.meta.props`. You just need a view name to know what component to place in there.

In both examples, the component is lazy loaded (this is not an obligation as you could just write `return MyPersonalGame`). This is a perfect way to load only what you need and the perfect use case for me is discriminating between templates used on desktops and templates used on mobiles (and if you do it well, there is no need to duplicate the code in your MypersonalGame.vue and MyPersonalGame.phone.vue files).

Note that the `components` property in `meta` overrides the one at the root of the route definition. This means that you can still have both (a default view could still be placed in the second one for instance).

### Transition

The `router-view-ex` takes an optional transition attribute in case you want to animate components switching into your named view. The plugin is supplied with a default fade transition that you can activate with (the 'vre' prefix stands for vue3-router-ex):

```html
<router-view-ex name="MainContent" transition="vre-fade"></router-view-ex>
```

This transition is defined like this and is mainly here to show you the concept (although you can use it):

```css
transition: opacity 0.1s ease;
```

If you want to use your own transition, just name it the way you want and [define your proper styles](https://vuejs.org/guide/built-ins/transition#css-based-transitions) as you normally do for Vue 3 transitions.

# Redirection

When the resolver that we have seen before is ready, the plugin gives you the opportunity to determine if you want to redirect to another route. This is done by adding a `meta.redirectTo` to your route definition that is a function returning a new route object.

```javascript
meta: {
    redirectTo: async function (resolver, transition) {
        const game = await resolver.game

        if (!game.isMine && !game.isBorrowed) {
            return { name: 'publicPersonalGame', params: { id: game.id, name: dashify(game.name) } };
        }
    }
}
```

In this example, if the browser targets a game that is not mine or that I don't borrow, then it will redirect to the public page of the corresponding game listing.

You can also redirect to another route at some other stages, thanks to hook.

# Hooks

## beforeEnterBegin

As you probably know, when you use the composition API, there is no way to hook into routing inside your components. Only `onBeforeRouteUpdate` and `onBeforeRouteLeave` can be defined there. This plugin does not solve this exactly but it gives you the possibility to know when the route is being entered inside your route definition.

The plugin uses the `beforeEach` method of the router and calls your `meta.beforeEnterBegin` right away. At this stage, your resolves are not known yet, but this is a perfect place to redirect for other reasons than a resolve that would dictate so (where `meta.redirectTo` is better suited).

For instance, you can protect some pages against non logged in users or avoid pages that don't make sense for a logged in user, and redirect by returning a target:

```javascript
meta: {
    beforeEnterBegin: (to, from) => {
        if (to.meta.requiresAuth) {
            const { authUser } = useAuthUserStore()
            const { appSettings } = useAppSettings()

            if (!authUser.isLoggedIn) {
                toast.error(appSettings.localized.needAccount)
                return { name: 'signin', query: { returnUrl: to.path } }
            }
        }

        if (to.meta.requiresAnon) {
            const { authUser } = useAuthUserStore()
            if (authUser.isLoggedIn) {
                return { name: 'explore' }
            }
        }
    }
}
```

Note that the `mea.beforeEnterBegin` function is called in each matched route, from ancestors to children. This example lies in the top route, since it is general. If it redirects, child `meta.beforeEnterBegin` are not called.

## beforeEnterEnd

After your `meta.redirectTo` has been called and after your resolves have been loaded, `meta.beforeEnterEnd` is called, this time in reverse order, from child to ancestors. It's also called when an exception occurs in your code (in one of your resolve function for instance), in which case the failure argument equals `{ error: 'resolve' }`. In this example, your code displays an error and redirects:

```javascript
meta: {
    beforeEnterEnd: (to, from, failure) => {
        if (failure && failure.error == 'resolve') {
            toast.error(i18n.global.t('global.data404'))
            return { name: 'explore' }
        }
    }
}
```

## afterEnter

When a route is accepted or has a failure, the `router.afterEach` handler is still called to let you know. In that case, your `meta.afterEnter` functions in all matched routes will be called, from child to ancestors.

Here is an example where I handle the page title and some potential error. It could also deal with analytics.

```javascript
meta: {
    afterEnter: async (to, from, failure) => {
        if (failure && !isNavigationFailure(failure, NavigationFailureType.duplicated)) {
            // Something bad happened in Vue Router
            toast.error(i18n.global.t('global.routeUnreachable'))
            return
        }

        // Handle page title that can be set statically (in meta) or dynamically in resolves (put in meta.props from resolves)
        const pageTitle = to.meta.pageTitle ?? to.meta?.props?.pageTitle
        if (pageTitle) {
            const { appSettings } = useAppSettings()
            document.title = pageTitle[appSettings.lang] || pageTitle
        }
        else {
            document.title = 'Generic title'
        }
    }
}
```
