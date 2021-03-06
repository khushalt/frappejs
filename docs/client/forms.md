# Forms

Forms are automatically created from the model (DocType)

Form objects create the controls and also handler insert and update.

Note: A single Form object can handle multiple documents.

### Example

```js
const Page = require('frappejs/frappe/client/view/page');
const Form = require('frappejs/frappe/client/view/form');

edit_page = new Page('Edit To Do');

router.add('/edit/todo/:name', edit_page);

edit_page.form = new Form({
	doctype: 'ToDo',
	parent: edit_page.body
});
```

## Creating

To create a new Form, you need to pass the model (DocType) and `parent` element.

Controls will be created for all the `fields` of the model that is passed along with a `Submit` button

## Editing

To setup a form for editing, you can bind a document by calling the `use` method.

```js
edit_page.on('show', async (params) => {
	let doc = await frappe.get_doc('ToDo', params.name);
	edit_page.form.use(doc);
})
```

## New Document

To setup a form for a new document, just create a new document with the Frappe.js document helpers, and `use` it with paramter `is_new` = true

```js
// setup todo new
frappe.router.add('new/todo', async (params) => {

	// new document
	app.doc = await frappe.get_doc({doctype: 'ToDo'});

	// set a random name
	app.doc.set_name();

	// show the page
	app.edit_page.show();

	// is_new=true
	app.edit_page.form.use(app.doc, true);
});
```