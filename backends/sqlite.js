const frappe = require('frappejs');
const sqlite3 = require('sqlite3').verbose();
const debug = false;

class sqliteDatabase {
    constructor({db_path}) {
        this.db_path = db_path;
        this.init_type_map();
    }

    connect(db_path) {
        if (db_path) {
            this.db_path = db_path;
        }
        return new Promise(resolve => {
            this.conn = new sqlite3.Database(this.db_path, () => {
                if (debug) {
                    this.conn.on('trace', (trace) => console.log(trace));
                }
                resolve();
            });
        });
    }

    async migrate() {
        for (let doctype in frappe.modules) {
            // check if controller module
            if (frappe.modules[doctype].Meta) {
                if (await this.table_exists(doctype)) {
                    await this.alter_table(doctype);
                } else {
                    await this.create_table(doctype);
                }

            }
        }
        await this.commit();
    }

    async create_table(doctype) {
        let meta = frappe.get_meta(doctype);
        let columns = [];
        let values = [];

        for (let df of meta.get_valid_fields()) {
            if (this.type_map[df.fieldtype]) {
                columns.push(this.get_column_definition(df));
                if (df.default) {
                    values.push(df.default);
                }
            }
        }

        const query = `CREATE TABLE IF NOT EXISTS ${frappe.slug(doctype)} (
            ${columns.join(", ")})`;

        return await this.run(query, values);
    }

    close() {
        this.conn.close();
    }

    get_column_definition(df) {
        return `${df.fieldname} ${this.type_map[df.fieldtype]} ${df.reqd ? "not null" : ""} ${df.default ? "default ?" : ""}`
    }

    async alter_table(doctype) {
        // get columns
        let table_columns = (await this.sql(`PRAGMA table_info(${doctype})`)).map(d => d.name);
        let meta = frappe.get_meta(doctype);
        let values = [];

        for (let df of meta.get_valid_fields()) {
            if (!table_columns.includes(df.fieldname) && this.type_map[df.fieldtype]) {
                values = []
                if (df.default) {
                    values.push(df.default);
                }
                await this.run(`ALTER TABLE ${frappe.slug(doctype)} ADD COLUMN ${this.get_column_definition(df)}`, values);
            }
        }
    }

    get(doctype, name, fields='*') {
        if (fields instanceof Array) {
            fields = fields.join(", ");
        }
        return new Promise((resolve, reject) => {
            this.conn.get(`select ${fields} from ${frappe.slug(doctype)}
                where name = ?`, name,
                (err, row) => {
                    resolve(row || {});
                });
        });
    }

    async insert(doctype, doc) {
        let placeholders = Object.keys(doc).map(d => '?').join(', ');
        return await this.run(`insert into ${frappe.slug(doctype)}
            (${Object.keys(doc).join(", ")})
            values (${placeholders})`, this.get_formatted_values(doc));
    }

    async update(doctype, doc) {
        let assigns = Object.keys(doc).map(key => `${key} = ?`);
        let values = this.get_formatted_values(doc);
        values.push(doc.name);

        return await this.run(`update ${frappe.slug(doctype)}
                set ${assigns.join(", ")} where name=?`, values);
    }

    get_formatted_values(doc) {
        return Object.values(doc).map(value => {
            if (value instanceof Date) {
                return value.toISOString();
            } else {
                return value;
            }
        })
    }

    async delete(doctype, name) {
        return await this.run(`delete from ${frappe.slug(doctype)} where name=?`, name);
    }

    get_all({doctype, fields, filters, start, limit, order_by='modified', order='desc'} = {}) {
        if (!fields) {
            fields = frappe.get_meta(doctype).get_keyword_fields();
        }
        return new Promise((resolve, reject) => {
            let conditions = this.get_filter_conditions(filters);

            this.conn.all(`select ${fields.join(", ")}
                from ${frappe.slug(doctype)}
                ${conditions.conditions ? "where" : ""} ${conditions.conditions}
                ${order_by ? ("order by " + order_by) : ""} ${order_by ? (order || "asc") : ""}
                ${limit ? ("limit " + limit) : ""} ${start ? ("offset " + start) : ""}`, conditions.values,
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
        });
    }

    get_filter_conditions(filters) {
        // {"status": "Open"} => `status = "Open"`
        // {"status": "Open", "name": ["like", "apple%"]}
            // => `status="Open" and name like "apple%"
        let conditions = [];
        let values = [];
        for (let key in filters) {
            const value = filters[key];
            if (value instanceof Array) {
                // if its like, we should add the wildcard "%" if the user has not added
                if (value[0].toLowerCase()==='like' && !value[1].includes('%')) {
                    value[1] = `%${value[1]}%`;
                }
                conditions.push(`${key} ${value[0]} ?`);
                values.push(value[1]);
            } else {
                conditions.push(`${key} = ?`);
                values.push(value);
            }
        }
        return {
            conditions: conditions.length ? conditions.join(" and ") : "",
            values: values
        };
    }

    run(query, params) {
        return new Promise((resolve, reject) => {
            this.conn.run(query, params, (err) => {
                if (err) {
                    console.log(err);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    sql(query, params) {
        return new Promise((resolve) => {
            this.conn.all(query, params, (err, rows) => {
                resolve(rows);
            });
        });
    }

    async commit() {
        try {
            await this.run('commit');
        } catch (e) {
            if (e.errno !== 1) {
                throw e;
            }
        }
    }

    async get_value(doctype, filters, fieldname='name') {
        if (typeof filters==='string') {
            filters = {name: filters};
        }

        let row = await this.get_all({
            doctype:doctype,
            fields: [fieldname],
            filters: filters,
            start: 0,
            limit: 1});
        return row.length ? row[0][fieldname] : null;
    }

    async table_exists(table) {
        const name = await this.sql(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`);
        return (name && name.length) ? true : false;
    }

    init_type_map() {
        this.type_map = {
            'Currency':        'real'
            ,'Int':            'integer'
            ,'Float':        'real'
            ,'Percent':        'real'
            ,'Check':        'integer'
            ,'Small Text':    'text'
            ,'Long Text':    'text'
            ,'Code':        'text'
            ,'Text Editor':    'text'
            ,'Date':        'text'
            ,'Datetime':    'text'
            ,'Time':        'text'
            ,'Text':        'text'
            ,'Data':        'text'
            ,'Link':        'text'
            ,'Dynamic Link':'text'
            ,'Password':    'text'
            ,'Select':        'text'
            ,'Read Only':    'text'
            ,'Attach':        'text'
            ,'Attach Image':'text'
            ,'Signature':    'text'
            ,'Color':        'text'
            ,'Barcode':        'text'
            ,'Geolocation':    'text'
        }
    }

}

module.exports = { Database: sqliteDatabase };
