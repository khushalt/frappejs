const frappe = require('frappejs');

module.exports = class Router {
    constructor() {
        this.current_page = null;
        this.static_routes = [];
        this.dynamic_routes = [];
    }

    add(route, handler) {
        let page = {handler: handler, route: route};

        // '/todo/:name/:place'.match(/:([^/]+)/g);
        page.param_keys = route.match(/:([^/]+)/g);

        if (page.param_keys) {
            // make expression
            // '/todo/:name/:place'.replace(/\/:([^/]+)/g, "\/([^/]+)");
            page.depth = route.split('/').length;
            page.expression = route.replace(/\/:([^/]+)/g, "\/([^/]+)");
            this.dynamic_routes.push(page);
            this.sort_dynamic_routes();
        } else {
            this.static_routes.push(page);
            this.sort_static_routes();
        }
    }

    sort_dynamic_routes() {
        // routes with more parts first
        this.dynamic_routes = this.dynamic_routes.sort((a, b) => {
            if (a.depth < b.depth) {
                return 1;
            } else if (a.depth > b.depth) {
                return -1;
            } else {
                if (a.param_keys.length !== b.param_keys.length) {
                    return a.param_keys.length > b.param_keys.length ? 1 : -1;
                } else {
                    return a.route.length > b.route.length ? 1 : -1;
                }
            }
        })
    }

    sort_static_routes() {
        // longer routes on first
        this.static_routes = this.static_routes.sort((a, b) => {
            return a.route.length > b.route.length ? 1 : -1;
        });
    }

    listen() {
        window.addEventListener('hashchange', (event) => {
            this.show(window.location.hash);
        });
    }

    set_route(...parts) {
        const route = parts.join('/');
        window.location.hash = route;
    }

    async show(route) {
        if (route && route[0]==='#') {
            route = route.substr(1);
        }

        if (!route) {
            route = this.default;
        }
        let page = this.match(route);

        if (page) {
            if (typeof page.handler==='function') {
                await page.handler(page.params);
            } else {
                await page.handler.show(page.params);
            }
        } else {
            await this.match('not-found').handler({route: route});
        }
    }

    match(route) {
        // match static
        for(let page of this.static_routes) {
            if (page.route === route) {
                return {handler: page.handler};
            }
        }

        // match dynamic
        for(let page of this.dynamic_routes) {
            let matches = route.match(new RegExp(page.expression));

            if (matches && matches.length == page.param_keys.length + 1) {
                let params = {}
                for (let i=0; i < page.param_keys.length; i++) {
                    params[page.param_keys[i].substr(1)] = matches[i + 1];
                }
                return {handler:page.handler, params: params};
            }
        }
    }
}