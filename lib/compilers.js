'use strict';

/*
 * Dependencies.
 */

var trim = require('trim');
var detab = require('detab');
var visit = require('mdast-util-visit');
var util = require('./util.js');
var h = require('./h.js');

/*
 * Constants.
 */

var FIRST_WORD = /^[^\ \t]+(?=[\ \t]|$)/;

/*
 * Compilers.
 */

var visitors = {};

/**
 * Return the content of a reference without definition
 * as markdown.
 *
 * @example
 *   failsafe({
 *     identifier: 'foo',
 *     referenceType: 'shortcut',
 *     children: [
 *       {
 *         type: 'text',
 *         value: 'foo'
 *       }
 *     ]
 *   }, {}); // '[foo]'
 *
 * @param {Node} node - Node to compile.
 * @param {Node?} definition
 * @param {HTMLCompiler} context
 * @return {string?} - If without definition, returns a
 *   string, returns nothing otherwise.
 */
function failsafe(node, definition, context) {
    var result;

    if (node.referenceType === 'shortcut' && !definition.link) {
        result = node.children ? context.all(node).join('') : node.alt;

        return (node.type === 'imageReference' ? '!' : '') +
            '[' + result + ']';
    }

    return '';
}

/**
 * Stringify all footnote definitions, if any.
 *
 * @example
 *   generateFootnotes(); // '<div class="footnotes">\n<hr>\n...'
 *
 * @return {string} - Compiled footnotes, if any.
 * @this {HTMLCompiler}
 */
function generateFootnotes() {
    var self = this;
    var definitions = self.footnotes;
    var length = definitions.length;
    var index = -1;
    var results = [];
    var def;
    var content;

    if (!length) {
        return '';
    }

    while (++index < length) {
        def = definitions[index];

        results[index] = self.listItem({
            'type': 'listItem',
            'attributes': {
                'id': 'fn-' + def.identifier
            },
            'children': def.children.concat({
                'type': 'link',
                'href': '#fnref-' + def.identifier,
                'attributes': {
                    'class': 'footnote-backref'
                },
                'children': [{
                    'type': 'text',
                    'value': '↩'
                }]
            }),
            'position': def.position
        }, {});
    }

    content = h(self, null, 'hr') + '\n' +
        h(self, null, 'ol', results.join('\n'), true);

    return h(self, null, 'div', {
        'class': 'footnotes'
    }, content, true) + '\n';
}

/**
 * Stringify the children of `node`.
 *
 * @example
 *   all({
 *     children: [
 *       {
 *         type: 'text',
 *         value: 'foo'
 *       }
 *     ]
 *   }); // 'foo'
 *
 * @param {Node} parent
 * @return {Array.<string>}
 * @this {HTMLCompiler}
 */
function all(parent) {
    var self = this;
    var nodes = parent.children;
    var values = [];
    var index = -1;
    var length = nodes.length;
    var value;
    var prev;

    while (++index < length) {
        value = self.visit(nodes[index], parent);

        if (value) {
            if (
                prev &&
                (
                    prev.type === 'break' ||
                    (prev.type === 'escape' && prev.value === '\n')
                )
            ) {
                value = trim.left(value);
            }

            values.push(value);
        }

        prev = nodes[index];
    }

    return values;
}

/**
 * Stringify a root object.
 *
 * @example
 *   // This will additionally include defined footnotes,
 *   // when applicable.
 *   root({
 *     children: [
 *       {
 *         type: 'paragraph',
 *         children: [
 *           {
 *             type: 'text',
 *             value: 'foo'
 *           }
 *         ]
 *       }
 *     ]
 *   }); // '<p>foo</p>\n'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function root(node) {
    var self = this;
    var definitions = {};
    var footnotes = [];
    var result;

    self.definitions = definitions;
    self.footnotes = footnotes;

    visit(node, 'definition', function (definition) {
        definitions[definition.identifier.toUpperCase()] = definition;
    });

    visit(node, 'footnoteDefinition', function (definition) {
        footnotes.push(definition);
    });

    result = self.all(node).join('\n');

    return (result ? result + '\n' : '') + self.generateFootnotes();
}

/**
 * Stringify a block quote.
 *
 * @example
 *   blockquote({
 *     children: [
 *       {
 *         type: 'paragraph',
 *         children: [
 *           {
 *             type: 'text',
 *             value: 'foo'
 *           }
 *         ]
 *       }
 *     ]
 *   }); // '<blockquote>\n<p>foo</p>\n</blockquote>'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function blockquote(node) {
    return h(this, node, 'blockquote', this.all(node).join('\n'), true);
}

/**
 * Stringify an inline footnote.
 *
 * @example
 *   // This additionally adds a definition at the bottem
 *   // of the document.
 *   footnote({
 *     children: [
 *       {
 *         type: 'text',
 *         value: 'foo'
 *       }
 *     ]
 *   }); // '<sup id="fnref-1"><a href="#fn-1">1</a></sup>'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function footnote(node) {
    var self = this;
    var definitions = self.footnotes;
    var index = -1;
    var length = definitions.length;
    var identifiers = [];
    var identifier;

    while (++index < length) {
        identifiers[index] = definitions[index].identifier;
    }

    index = -1;
    identifier = 1;

    while (identifiers.indexOf(String(identifier)) !== -1) {
        identifier++;
    }

    identifier = String(identifier);

    self.footnotes.push({
        'type': 'footnoteDefinition',
        'identifier': identifier,
        'children': node.children,
        'position': node.position
    });

    return self.footnoteReference({
        'type': 'footnoteReference',
        'identifier': identifier,
        'position': node.position
    });
}

/**
 * Stringify a list.
 *
 * @example
 *   list({
 *     ordered: true
 *     loose: false
 *     children: [
 *       {
 *         type: 'listItem',
 *         children: [
 *           {
 *             type: 'paragraph',
 *             children: [
 *               {
 *                 type: 'text',
 *                 value: 'foo'
 *               }
 *             ]
 *           }
 *         ]
 *       }
 *     ]
 *   }); // '<ol>\n<li>foo</li>\n</ol>'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function list(node) {
    return h(this, node, node.ordered ? 'ol' : 'ul', {
        'start': node.start !== 1 ? node.start : null
    }, this.all(node).join('\n'), true);
}

/**
 * Stringify a list-item.
 *
 * @example
 *   listItem({
 *     children: [
 *       {
 *         type: 'paragraph',
 *         children: [
 *           {
 *             type: 'text',
 *             value: 'foo'
 *           }
 *         ]
 *       }
 *     ]
 *   }, {
 *     loose: false
 *   }); // '<li>foo</li>'
 *
 * @param {Node} node - Node to compile.
 * @param {Node} parent - Parent of `node`.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function listItem(node, parent) {
    var item = node;
    var single;
    var result;

    single = !parent.loose &&
        node.children.length === 1 &&
        node.children[0].children;

    result = this.all(single ? item.children[0] : item)
        .join(single ? '' : '\n');

    return h(this, node, 'li', result, !single);
}

/**
 * Stringify a heading.
 *
 * @example
 *   heading({
 *     depth: 3,
 *     children: [
 *       {
 *         type: 'text',
 *         value: 'foo'
 *       }
 *     ]
 *   }); // '<h3>foo</h3>'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function heading(node) {
    return h(this, node, 'h' + node.depth, this.all(node).join(''));
}

/**
 * Stringify a paragraph.
 *
 * @example
 *   paragraph({
 *     children: [
 *       {
 *         type: 'text',
 *         value: 'foo'
 *       }
 *     ]
 *   }); // 'foo'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function paragraph(node) {
    return h(this, node, 'p', trim(detab(this.all(node).join(''))), false);
}

/**
 * Stringify a code block.
 *
 * @example
 *   code({
 *     value: 'foo &amp; bar;'
 *   }); // '<pre><code>foo &amp;amp; bar\n</code></pre>'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function code(node) {
    var self = this;
    var value = node.value ? detab(node.value + '\n') : '';
    var language = node.lang && node.lang.match(FIRST_WORD);

    return h(self, node, 'pre', h(self, node, 'code', {
        'class': language ? 'language-' + language[0] : null
    }, self.encode(value), false), false);
}

/**
 * Stringify a table.
 *
 * @example
 *   table({
 *     children: [
 *       {
 *         type: 'tableRow',
 *         ...
 *       }
 *     ]
 *   }); // '<table><thead>...'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function table(node) {
    var self = this;
    var rows = node.children;
    var index = rows.length;
    var align = node.align;
    var alignLength = align.length;
    var pos;
    var result = [];
    var row;
    var out;
    var name;

    while (index--) {
        pos = alignLength;
        row = rows[index].children;
        out = [];
        name = index === 0 ? 'th' : 'td';

        while (pos--) {
            out[pos] = h(self, row[pos], name, {
                'align': align[pos]
            }, row[pos] ? self.all(row[pos]).join('\n') : '');
        }

        result[index] = h(self, rows[index], 'tr', out.join('\n'), true);
    }

    return h(self, node, 'table',
        h(self, node, 'thead', result[0], true) + '\n' +
        h(self, node, 'tbody', result.slice(1).join('\n'), true),
        true
    );
}

/**
 * Stringify a literal HTML.
 *
 * @example
 *   html({
 *     value: '<i>italic</i>'
 *   }); // '<i>italic</i>'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function html(node) {
    return this.options.sanitize ? this.encode(node.value) : node.value;
}

/**
 * Stringify a horizontal rule.
 *
 * @example
 *   rule(); // '<hr>'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function rule(node) {
    return h(this, node, 'hr');
}

/**
 * Stringify inline code.
 *
 * @example
 *   inlineCode({
 *     value: 'foo &amp; bar;'
 *   }); // '<code>foo &amp;amp; bar;</code>'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function inlineCode(node) {
    return h(this, node, 'code', util.collapse(this.encode(node.value)));
}

/**
 * Stringify strongly emphasised content.
 *
 * @example
 *   strong({
 *     children: [
 *       {
 *         type: 'text',
 *         value: 'foo'
 *       }
 *     ]
 *   }); // '<strong>foo</strong>'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function strong(node) {
    return h(this, node, 'strong', this.all(node).join(''));
}

/**
 * Stringify emphasised content.
 *
 * @example
 *   emphasis({
 *     children: [
 *       {
 *         type: 'text',
 *         value: 'foo'
 *       }
 *     ]
 *   }); // '<em>foo</em>'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function emphasis(node) {
    return h(this, node, 'em', this.all(node).join(''));
}

/**
 * Stringify an inline break.
 *
 * @example
 *   hardBreak(); // '<br>\n'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function hardBreak(node) {
    return h(this, node, 'br') + '\n';
}

/**
 * Stringify a link.
 *
 * @example
 *   link({
 *     href: 'http://example.com',
 *     children: [
 *       {
 *         type: 'text',
 *         value: 'foo'
 *       }
 *     ]
 *   }); // '<a href="http://example.com">foo</a>'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function link(node) {
    return h(this, node, 'a', {
        'href': util.normalizeURI(node.href),
        'title': node.title
    }, this.all(node).join(''));
}

/**
 * Stringify a reference to a footnote.
 *
 * @example
 *   // If a definition was added previously:
 *   footnoteReference({
 *     identifier: 'foo'
 *   }); // '<sup id="fnref-foo"><a href="#fn-foo">foo</a></sup>'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function footnoteReference(node) {
    var identifier = node.identifier;

    return h(this, node, 'sup', {
        'id': 'fnref-' + identifier
    }, h(this, node, 'a', {
        'href': '#fn-' + identifier,
        'class': 'footnote-ref'
    }, identifier));
}

/**
 * Stringify a reference to a link.
 *
 * @example
 *   // If a definition was added previously:
 *   linkReference({
 *     identifier: 'foo'
 *   }); // '<a href="http://example.com/fav.ico"></a>'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function linkReference(node) {
    var self = this;
    var def = self.definitions[node.identifier.toUpperCase()] || {};

    return failsafe(node, def, self) || h(self, node, 'a', {
        'href': util.normalizeURI(def.link || ''),
        'title': def.title
    }, self.all(node).join(''));
}

/**
 * Stringify a reference to an image.
 *
 * @example
 *   // If a definition was added previously:
 *   imageReference({
 *     identifier: 'foo'
 *   }); // '<img src="http://example.com/fav.ico" alt="">'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function imageReference(node) {
    var self = this;
    var def = self.definitions[node.identifier.toUpperCase()] || {};

    return failsafe(node, def, self) || h(self, node, 'img', {
        'src': util.normalizeURI(def.link || ''),
        'alt': node.alt || '',
        'title': def.title
    });
}

/**
 * Stringify an image.
 *
 * @example
 *   image({
 *     src: 'http://example.com/fav.ico'
 *   }); // '<img src="http://example.com/fav.ico" alt="">'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function image(node) {
    return h(this, node, 'img', {
        'src': util.normalizeURI(node.src),
        'alt': node.alt || '',
        'title': node.title
    });
}

/**
 * Stringify a deletion.
 *
 * @example
 *   strikethrough({
 *     children: [
 *       {
 *         type: 'text',
 *         value: 'foo'
 *       }
 *     ]
 *   }); // '~~foo~~'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function strikethrough(node) {
    return h(this, node, 'del', this.all(node).join(''));
}

/**
 * Stringify text.
 *
 * @example
 *   text({value: '&'}); // '&amp;'
 *
 *   text({value: 'foo'}); // 'foo'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function text(node) {
    return util.trimLines(this.encode(node.value));
}

/**
 * Stringify escaped text.
 *
 * @example
 *   escape({value: '\n'}); // '<br>\n'
 *
 *   escape({value: '|'}); // '\\|'
 *
 * @param {Node} node - Node to compile.
 * @return {string} - Compiled node.
 * @this {HTMLCompiler}
 */
function escape(node) {
    return this[node.value === '\n' ? 'break' : 'text'](node);
}

/**
 * Return an empty string for nodes which are ignored.
 *
 * @example
 *   ignore(); // ''
 *
 * @return {string} - Empty string.
 * @this {HTMLCompiler}
 */
function ignore() {
    return '';
}

/*
 * Helpers.
 */

visitors.all = all;
visitors.generateFootnotes = generateFootnotes;

/*
 * Ignored nodes.
 */

visitors.yaml = ignore;
visitors.definition = ignore;
visitors.footnoteDefinition = ignore;

/*
 * Compilers.
 */

visitors.footnote = footnote;
visitors.root = root;
visitors.blockquote = blockquote;
visitors.list = list;
visitors.listItem = listItem;
visitors.paragraph = paragraph;
visitors.heading = heading;
visitors.table = table;
visitors.code = code;
visitors.html = html;
visitors.horizontalRule = rule;
visitors.inlineCode = inlineCode;
visitors.strong = strong;
visitors.emphasis = emphasis;
visitors.break = hardBreak;
visitors.link = link;
visitors.image = image;
visitors.footnoteReference = footnoteReference;
visitors.linkReference = linkReference;
visitors.imageReference = imageReference;
visitors.delete = strikethrough;
visitors.text = text;
visitors.escape = escape;

/*
 * Expose.
 */

module.exports = visitors;
