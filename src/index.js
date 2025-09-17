import { ref } from 'vue'
import RouterViewEx from './RouterViewEx.vue'
import { useRoute } from 'vue-router'

// Utility functions
//-------------------

function isArray(arr) {
  return Array.isArray(arr) || arr instanceof Array
}

function arrayRemove(arr, callback) {
  var i = arr.length
  while (i--) {
    if (callback(arr[i], i)) arr.splice(i, 1)
  }
}

function objectRemoveProperties(obj, predicate) {
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    if (!predicate(value))
      result[key] = value
  }
  return result
}

function objectHasSome(obj, predicate) {
  for (const [key, value] of Object.entries(obj)) {
    if (predicate(value))
      return true
  }
  return false
}

function getFunctionInformation(name, fn) {
  // Code taken from Angularjs source code (annotate function)
  const FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m
  const FN_ARG_SPLIT = /,/
  const FN_ARG = /^\s*(_?)(.+?)\1\s*$/
  const STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg

  var args,
    fnText,
    argDecl,
    last,
    actualFn

  if (typeof fn == 'function') {
    actualFn = fn
    args = []
    fnText = fn.toString().replace(STRIP_COMMENTS, '')
    argDecl = fnText.match(FN_ARGS)
    argDecl[1].split(FN_ARG_SPLIT).forEach(arg => {
      arg.replace(FN_ARG, function (all, underscore, name) {
        args.push(name)
      })
    })
  }
  else if (isArray(fn)) {
    last = fn.length - 1
    actualFn = fn[last]
    args = fn.slice(0, last)
  }

  return { args, fn: actualFn, name: name }
}

function routeParamsAreEqual(p1, p2) {
  // If some params have properties whose value is equal to empty string, remove these properties and compare again
  if ((objectHasSome(p1, pv => pv === '') || objectHasSome(p2, pv => pv === '')))
    return routeParamsAreEqual(objectRemoveProperties(p1, p => p === ''), objectRemoveProperties(p2, p => p === ''))

  const p1Keys = Object.keys(p1),
    p2Keys = Object.keys(p2);

  // If the number of props differ, then they are not equal
  if (p1Keys.length != p2Keys.length)
    return false

  // Check that both have the same keys and values
  if (!p1Keys.every(key => {
    if (p2Keys.indexOf(key) == -1) return false
    if (p1[key] != p2[key]) return false
  }))

    return true
}

function logError(err) {
  console.log('%c' + err.stack, 'background: #fcdede;padding: 4px; border-radius:2px;')
}

function array_move(arr, oldIndex, newIndex) {
  if (newIndex >= arr.length) {
    var k = newIndex - arr.length + 1
    while (k--) {
      arr.push(undefined)
    }
  }
  arr.splice(newIndex, 0, arr.splice(oldIndex, 1)[0])
}

// Plugin object
//---------------

const plugin = {
  install(app, options) {

    // Install global component
    app.component('router-view-ex', RouterViewEx)

    // Ensure the router is passed in options
    const router = options.router
    if (!router)
      throw new Error('You must pass the router to vue-router-ex, like so: app.use(vueRouterEx, { router })')

    /**
     * Takes a set of resolves found in route definitions, determines the correct order in which they should be evaluated based on their interdependencies and isolates their function and arguments.
     * 
     * @async
     * @param {object} resolves - The set of resolves to analyze.
     * @param {object} to - The current target route.
     * @param {object} from - The route the browser is coming from.
     * @returns {Array} An ordered array of objects where each one contains the keys 'name' (the name of the resolve), 'fn' (the function of the resolve) and 'args' (the arguments of the function), such object being called an annotated resolve.
     */
    async function processResolves(resolves, to, from) {
      // An array that will contain all the resolve functions, in the order that respects their inter dependencies
      const deps = []

      // If there are some resolves
      if (Object.keys(resolves).length) {

        // Get all the names of the resolves
        let resolveNames = Object.keys(resolves)

        // Let's process each resolve
        resolveNames.forEach(resolveName => {
          // Get the resolve function
          const func = resolves[resolveName]

          // Because it can be a function or an array containing dependencies, call this function (taken from the AngularJS code) to retrieve the actual resolve function and its arguments
          const fnInfo = getFunctionInformation(resolveName, func)

          // Each argument of the resolve function is a dependency
          // Let's process them one by one
          fnInfo.args.forEach(argName => {
            // Check if the dependency is already in the deps array
            const existingDep = deps.find(dep => dep.name == argName)

            // If not then place it in the array with just its name (we don't know its fn signature yet)
            if (!existingDep)
              deps.push({ name: argName })

            // If it's in the array already, let's add to it its function body and arguments
            else if (!existingDep.fn && fnInfo.name == existingDep.name) {
              existingDep.fn = fnInfo.fn
              existingDep.args = fnInfo.args ?? []
            }

            // If the resolve is already in the deps array, let's ensure that its arg comes first
            const propIndex = deps.findIndex(dep => dep.name == resolveName)
            if (propIndex != -1) {
              const argIndex = deps.findIndex(dep => dep.name == argName)

              // If the arg comes after, put it before
              if (propIndex < argIndex) {
                array_move(deps, argIndex, propIndex)
              }
            }
          })

          // Let's also ensure that the current processed resolve is in the deps array since it may be a dependency of another resolve
          const existingDep = deps.find(dep => dep.name == resolveName)
          // If it's not (it's not the dependency of another resolve), simply append it
          if (!existingDep)
            deps.push(fnInfo)
          // If it is already a dependency, add the function and args info to it
          else {
            existingDep.fn = fnInfo.fn
            existingDep.args = fnInfo.args ?? []
          }
        })

        // If a resolve is in need of the special $transition$ dependency, then let's create the actual function that returns the to and from values of the 'to' route
        const transitionDep = deps.find(dep => dep.name == '$transition$')
        if (transitionDep) {
          transitionDep.fn = function () { return { to, from } }
          transitionDep.args = []
        }
      }

      return deps
    }

    /**
     * Takes an ordered array of annotated resolves and evaluates their values.
     * 
     * @async
     * @param {Array} annotatedResolves - An ordered array of objects where each one contains the keys 'name' (the name of the resolve), 'fn' (the function of the resolve) and 'args' (the arguments of the function). When the function returns, each annotated resolve also contains a new 'value' key that contains the return of the resolve function.
     * @returns {object} An object where each key is the name of a resolve and its value is the resolve's function return value.
     */
    async function getAllResolvesValues(annotatedResolves) {
      if (!annotatedResolves || !annotatedResolves.length) return {}

      const resolvesWithValues = {}

      // Call each resolve in order to get their value
      for (let i = 0; i < annotatedResolves.length; i++) {
        let resolve = annotatedResolves[i]

        if (!resolve.hasOwnProperty('value')) {
          // Collect all the argument values needed to the resolve function
          const args = resolve.args.map(arg => annotatedResolves.find(d => d.name == arg).value)
          resolve.value = await Promise.resolve(resolve.fn.apply(resolve.fn, args))
        }

        resolvesWithValues[resolve.name] = resolve.value
      }

      return resolvesWithValues
    }

    /**
     * 
     * 
     * @async
     * @param {*} deps - 
     * @param {object} to - 
     * @param {object} from - 
     * @param {object} resolver - 
     */
    async function filterResolves(deps, to, from, resolver) {
      // Ask the current route what it wants to keep
      const resolve = to.meta.resolveFilter ? await to.meta.resolveFilter(resolver, { to, from }) : Object.keys(to.meta.resolve ?? {})

      let keep = [...resolve, '$transition$'] // Also keep the special $transition$ dep

      // Keep all resolves in parent routes
      for (let i = 0; i < to.matched.length - 1; i++) {
        const resolve = to.matched[i].meta?.resolve
        if (resolve)
          keep = [...keep, ...Object.keys(resolve)]
      }

      // Remove everything else
      arrayRemove(deps, dep => !keep.includes(dep.name))
    }

    /**
     * 
     * 
     * @async
     * @param {string} name - 
     * @param {*} resolves - 
     * @returns {any} 
     */
    async function getResolveValue(name, resolves) {
      const dep = resolves.find(dep => dep.name === name)
      if (dep.value)
        return dep.value

      const recursive = async (resolves, index) => {
        const dep = resolves[index]

        const args = []
        for (let i = 0; i < dep.args.length; i++) {
          const arg = dep.args[i]
          args.push(await recursive(resolves, resolves.findIndex(dep => dep.name == arg, index + 1)))
        }

        dep.value = await Promise.resolve(dep.fn.apply(dep.fn, args))
        return dep.value
      }

      const rev = resolves.toReversed()
      return recursive(rev, rev.findIndex(dep => dep.name == name))
    }

    /**
     * 
     * 
     * @async
     * @param {*} to 
     * @param {*} from 
     * @param {*} failure 
     * @returns {boolean|object} 
     */
    async function callBeforeEnterEnd(to, from, failure) {
      const routes = to.matched.toReversed()
      for (let i = 0; i < routes.length; i++) {
        var match = routes[i]
        if (match.meta.beforeEnterEnd) {
          try {
            const redirectToRoute = await match.meta.beforeEnterEnd(to, from, failure)
            if (redirectToRoute && ((redirectToRoute.name !== to.name) || !routeParamsAreEqual(redirectToRoute.params, to.params/*, compareRouteParams*/)))
              return redirectToRoute
          }
          catch (err) {
            logError(err)
            return false
          }
        }
      }
    }

    router.beforeEach(async (to, from) => {
      // If this function returns false, it can be detected in meta.afterEnter of a route with a failure set by vue router (failure.type == avigationFailureType.aborted).

      try {
        // For each matched route in descending order (parent before child), call beforeEnterBegin on its meta if it exists. This allows a route to redirect early.
        for (let i = 0; i < to.matched.length; i++) {
          var match = to.matched[i]
          if (match.meta.beforeEnterBegin) {
            try {
              const redirectToRoute = await match.meta.beforeEnterBegin(to, from)

              // If it redirects to a new route, then leave now
              if (redirectToRoute && ((redirectToRoute.name !== to.name) || !routeParamsAreEqual(redirectToRoute.params, to.params/*, compareRouteParams*/)))
                return redirectToRoute
            }
            catch (err) {
              // If there was an exception, log it and stop routing
              logError(err)
              return false
            }
          }
        }

        // Resolves must be taken from all ancestor routes, so let's build an object will all these resolves, from top to bottom
        let resolves = {}
        try {
          to.matched.forEach(route => {
            if (route.meta.resolve) {
              resolves = {
                ...resolves,
                ...route.meta.resolve
              }
            }
          })
        }
        catch (err) {
          // If there was an exception (i.e. route.meta.resolve is not an object), log it and stop routing
          logError(err)
          return false
        }

        let deps = await processResolves(resolves, to, from)

        // Prepare a public resolver object
        const resolver = new Proxy(deps, {
          get(target, prop) {
            return getResolveValue(prop, target)
          }
        })

        try {
          if (to.matched[to.matched.length - 1]?.meta?.redirectTo) {
            // If the route definition has a redirectTo (function) prop, then call it to know if we should redirect instead
            const redirectToRoute = await to.matched[to.matched.length - 1].meta.redirectTo.call(null, resolver, { to, from })

            if (redirectToRoute && ((redirectToRoute.name !== to.name) || !routeParamsAreEqual(redirectToRoute.params, to.params/*, compareRouteParams*/)))
              return redirectToRoute
          }

          // Filter the deps with what the route really needs
          await filterResolves(deps, to, from, resolver)

          // Get all the values for the needed props
          const propsWithValues = await getAllResolvesValues(deps)

          // Build the final route props by including the route params
          to.meta.props = {
            ...to.meta.props,
            ...to.params,  // Add the route params
			...to.query    // Add the query string params
          }

		// When transitioning to a new route
		if (to.name != from.name) {
			// Include in the meta a function that will allow retrieving the resolves by name
			to.meta.routeResolvesFn = (propNames) => {
				to.meta.routeResolves =  propNames.reduce((acc, propName) => {
					if (propsWithValues.hasOwnProperty(propName)) {
						acc[propName] = ref(propsWithValues[propName])
					} else {
						// If the resolve does not exist, return a ref(undefined)
						acc[propName] = ref()
					}
					return acc
				}, {})
				return to.meta.routeResolves
			}
		}
		// When transitioning to the same route (with different params)
		else {
			delete to.meta.routeResolvesFn
			to.meta.routeResolves = from.meta.routeResolves

			// Don't create new refs in meta.routeResolves
			// Instead, update the existing ones
			Object.keys(from.meta.routeResolves).forEach(x => {
				const existingRef = from.meta.routeResolves[x]
				if (existingRef)
					existingRef.value = propsWithValues[x]
			})
		}
		
		// Also set the resolves on the meta object
		to.meta.resolves = propsWithValues

		// Also set the route params on the meta object
		to.meta.params = to.params

		// The special $transition$ dep can be removed from props
		delete to.meta.props.$transition$
		delete to.meta.resolves.$transition$
}
        catch (err) {
          logError(err)

          // For each matched route in reverse order (child before parent), call beforeEnterEnd on its meta if it exists, with the reason of the failure. It gives a chance to the client code to react.
          return (await callBeforeEnterEnd(to, from, { error: 'resolve' })) ?? false
        }

        // For each matched route in reverse order (child before parent), call beforeEnterEnd on its meta if it exists. It gives a last chance to redirect when all props are known.
        const redirect = await callBeforeEnterEnd(to, from)
        if (redirect)
          return redirect
      }
      catch (err) {
        logError(err)

        return options.globalerrorHandler?.()
      }
    })

    router.afterEach(async (to, from, failure) => {
      if (!failure) {
        // Handle history api state and put it in the route meta.props property
        if (window.history.state.props) {
          to.meta.props = {
            ...to.meta.props,
            ...window.history.state.props
          }

          // Clear window.history.state.props so that F5 does not bring them back
          // delete window.history.state.props
        }
      }

      // For each matched route in reverse order, call beforeEnter on its meta if it exists
      const routes = to.matched.toReversed()
      for (let i = 0; i < routes.length; i++) {
        var match = routes[i]
        if (match.meta.afterEnter) {
          try {
            await match.meta.afterEnter(to, from, failure)
          }
          catch { }
        }
      }
    })
  }
}

// Plugin's exported function 
//----------------------------

/**
 * Allows the client to register all its routes with the plugin.
 * 
 * @param {object} router - The instance of the router created by the createRouter function.
 * @param {Array} routeDefinitions - An array of route definitions with all the new meta keys that the plugin is able to use.
 */
function useRoutesLoader(router, routeDefinitions) {

  // Utility function to reorder the routes so that parent routes are created before their children
  const buildRoutesTree = function(routes) {
    const orderedRoutes = []

    routes.forEach(route => {
      const routeIndex = orderedRoutes.findIndex(r => r.name === route.name)
      const parent = route.parent ? routes.find(r => r.name === route.parent) : null

      if (parent) {
        const parentIndex = orderedRoutes.findIndex(r => r.name === parent.name)

        // Add the parent of the current route
        if (parentIndex == -1) {
          if (routeIndex == -1)
            orderedRoutes.push(parent)  // at the end of orderedRoutes if its child is not there already
          else
            orderedRoutes.splice(parent, 0, parent) // Or just before the child
        }

        // Add the route at the end of orderedRoutes if it is not there already
        if (routeIndex == -1)
          orderedRoutes.push(route)

        // Otherwise, check that the child and parent are in the correct order
        else if ((parentIndex != -1) && (parentIndex > routeIndex))
          array_move(orderedRoutes, parentIndex, routeIndex)
      }
      else {
        // If the root node is already in the array, move it at the front
        if (routeIndex != -1)
          array_move(orderedRoutes, routeIndex, 0)
        // Otherwise, place it at the front
        else
          orderedRoutes.unshift(route)
      }
    })

    return orderedRoutes
  }

  const routes = buildRoutesTree(routeDefinitions.flat())

  // For each defined route:
  routes.forEach(route => {
    // If there is no custom props property set on the route, add one that will ensure that all route resolves (fetched data among them) and route params are available as props inside components
    if (route.props)
      throw new Error('Don\'t add your own \'props\' property to the route. It will be overwritten. Instead, use resolves in the route definition to create the needed props.')

    route.props = to => to.meta.props

    // Add the route to the router, taking into consideration a parent if any
    router.addRoute(route.parent ?? route, route.parent ? route : null)
  })
}

function defineResolves(propNames) {
	const route = useRoute()
	return route.meta.routeResolvesFn(propNames)
}

// Exports
//---------

export {
	useRoutesLoader,
	defineResolves,
	plugin
}
