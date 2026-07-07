# Concept State: Simple State Form (SSF)

## Motivation

Simple State Form (SSF) is a syntax for data modeling that is designed to be both easy to read (by technical and non-technical people alike) and also easily translatable into a database schema (either by an LLM or by a conventional parser). It is intended to be compatible with collection databases (such as MongoDB), relational databases (such as SQLite), relational modeling languages (such as Alloy), and also graph databases (such as Neo4j and GraphQL). SSF was motivated by the need for a simple language for state declarations for concepts in concept design.

## Examples

A set of users, each with a username and password, both strings:

	a set of Users with
	  a username String
	  a password String

A set of users, each with a set of followers who are users:

	a set of Users with
	  a followers set of Users

A set of users, each with a profile (using the ability to omit a field name, so that the implicit field name is "profile"):

	a set of Users with
	  a Profile

A set of users with a status that is enumerated:

	a set of Users with
	  a status of PENDING or REGISTERED

A singleton set used for global settings:

	an element GlobalSettings with
	  a deployed Flag
	  an applicationName String
	  an apiKey String

A set of users, and a subset that have been banned on a particular date and by a particular user:

	a set of Users with
	  a username String
	  a password String

	a Banned set of Users with
	  a bannedOn Date
	  a bannedBy User

A subset without any relations:

	a set of Users with
	  a username String
	  a password String

	a Banned set of Users

A set of items, classified into books and movies:

	a set of Items with
	  a title String
	  a created Date

	a Books set of Items with
	  an isbn String
	  a pageCount Number
	  an author Person

	a Movies set of Items with
	   an imdb String
	   a director String
	   an actors set of Persons

	a set of Persons with
	   a name String
	   a dob Date

A mapping defined separately on a set, using a subset (defining a relation called *followers* mapping users in the subset *Followed* to users):

	a set of Users with
	  a username String
	  a password String

	a Followed set of Users with
	  a followers set of Users

An implicitly named field (called *profile*, relating *Users* to *Profiles*)

	a set of Users with
	  a Profile

An implicitly named set-typed field (called *options*, relating *Questions* to Options)

	a set of Questions with
	  a set of Options

A model of a simple folder scheme in which folders and files have names:

	a set of Folders with
	  an optional parent Folder
	  a name String

	a RootFolder element of Folder

	a set of Files with
	  a Folder
	  a name String

A model of a Unix like scheme in which names are local to directories:

	a set of FileSystemObjects

	a Files set of FileSystemObjects

	a Directories set of FileSystemObjects with
	  a set of Entries

	a RootDirectory element of Directories

	a set of Entries with
	  a name String
	  a member FileSystemObject

## Grammar

- *schema* ::= ( *set-decl* | *subset-decl* )*
- *set-decl* ::= [ "a" | "an" ] ("element" | "set") [ "of" ] *object-type* [ "with" *field-decl*+ ]
- *subset-decl* ::= [ "a" | "an" ] *sub-type* ("element" | "set") [ "of" ] ( *object-type* | *sub-type* ) [ "with" *field-decl*+ ]
- *field-decl* ::= [ "a" | "an" ] ["optional"] [*field-name*] (*scalar-type* | *set-type*)
- *scalar-type* ::= *object-type* | *parameter-type* | *enumeration-type* | *primitive-type*
- *set-type* ::= ("set" | "seq") [ "of" ] *scalar-type*
- *enumeration-type* ::= "of" (*enum-constant* "or" )+ *enum-constant*

### Grammar conventions

- [ x ] means x is optional
- ( x ) parentheses are used for grouping and do not appear in the actual language
- a | b means either a or b
- x* means an iteration of zero or more of x
- x+ means an iteration of one or more of x

### Grammar constraints

- A *field-name* may be omitted only for declaring a field of *object-type* or *parameter-type*. Omitting the field name is equivalent to including a name that is the same as the name of the type but with the first character in lower case.
- The hierarchy that is specified by *subset-decls* cannot contain cycles. Thus, a *subset-decl* may not, for example, declare a subset with a *sub-type* that is the same as the *sub-type* that it is a subset of.
- The *field-names* within a *set-decl* or *subset-decl* must be unique. Also, within all the decls that are in the hierarchy beneath a *set-decl*, *field-names* must be unique.
- A *field-decl* that has a *set-type* cannot use the *optional* keyword.

## Lexical considerations: identifiers

- The identifiers *enum-constant*, *field-name*, *sub-type*, *object-type*, *parameter-type* and *primitive-type* are sequences of alphabetic characters, digits and underscores, starting with an alphabetic character. The alphabetic characters in an *enum-constant* must all be uppercase. A *field-name* must start with a lower case alphabetic character. A *subset-name*, *object-type*, *parameter-type* or *primitive-type* must start with an upper case alphabetic character.
- The standard values from which a *primitive-type* is drawn are "Number", "String", "Flag", "Date", "DateTime".

## Lexical considerations: layout

- The language is whitespace-sensitive to ensure unambiguous parsing
- Each declaration must occupy a single line
- Field declarations must be indented beneath the set declarations they belong to
- Types can optionally be pluralized, so "a set of Strings" is equivalent to "a set of String"
- Type names must always be capitalized ("User") and field and collection names are not capitalized ("email")
- Enumeration values (and no other names or types) are in uppercase
- The name of a field can be omitted only for an object type or a set of object types, in which case the implicit name of the field is the lowercased version of the type name, singular for a scalar and plural for a set.

## Declaration structure, navigation & invariants

The way that declarations are structured does *not* imply anything about what navigation pattern is supported. In particular, there is no implication from a set declaration of an expected iteration over the set, or that going from the "parent" to the "child" is supported but not the reverse. So if we write

	a set of Users with
	  a Group

for example, this does *not* mean that to find the users associated with a given group necessarily requires iterating through all the users, and that if this navigation were desired it would be preferable to write

	a set of Groups with
	  a set of Users

so that given a group one could "navigate" directly to the group's users. On the contrary, which of these is preferred depends on two factors. First, in some cases, one might seem more natural. Second, there may be a multiplicity constraint that one formulation will allow, obviating the need to make the constraint explicit. In this case, for example, the first declaration makes it clear that each user belongs to only one group, whereas to assert this in the presence of the second declaration, an additional constraint would have to be noted informally.

## Two views of a declaration

Consider a declaration such as:

	a set of Users with
	  a username String
	  a password String

There are different ways to view this:
- **Collection of objects or documents**. The declaration introduces a collection of structured objects or documents, in this case a collection of users, each of which has a username and a password.
- **Set and relations**. The declaration introduces a set of identifiers (say {u1, u2, u3}), and two relations, one called username that maps each user to their username (say {(u1, "Alice"), (u2, "Bob"), (u3, "Carol")}), and one called password that maps each user to their password (say {(u1, "foo"), (u2, "bar"), (u3, "baz")}).

The collection of objects view is how non-technical readers will prefer to understand the declaration. But the sets and relations view is more correct, and addresses some subtle points more straightforwardly:

- **Shared substructure**. The collection of objects view might appear to suggest that these objects cannot "share" sub-objects, but that is not the case. For example, the same book can be in a book club and in the set of books read by a member.
- **Multiple structures**. The relational view makes it easier to understand how multiple declarations can define structural aspects of the "same object." Two declarations can describe different properties of users (one for authentication, another for profiles), achieving separation of concerns.
- **Defining associations**. A declaration in one concept may define the expected structure of an object, and a declaration in another may define an object's association with another object.

## Overview of Key Semantic Features

- Set and subset declarations introduce sets of objects, named by *object-types* and *sub-types*. Every member of a subset is expected also to be a member of the corresponding superset.
- The subsets of a set can overlap. Subsets offer a way both to classify objects (in a traditional subtype hierarchy) and also a way to declare relations on existing sets without extending the set declaration.
- When the keyword "element" is used rather than "set" in a set or subset declaration, the declared set is constrained to contain exactly one object.
- The value of an object is just its identity, so an object should not be thought of as a composite. But the notion of an object (as in object-oriented programming) is naturally represented as an object with fields, where the fields are considered to be relations mapping the object (identity) to other values.
- Every field can be viewed as a relation that maps an object to a set of values that may be empty or may contain a single value or multiple values. An optional scalar field corresponds to the empty case. A field with a set type should *not* be declared as optional; instead an empty set should be used when there is no value to map to.
- A field that is declared with the seq keyword is like one declared with the set keyword, except that the elements are ordered.

## Translation into Databases

A schema can be translated into a MongoDB database as follows:
- Each set or subset decl is represented as a collection, with documents having the fields specified for that set or subset.
- A singleton set is likewise represented as a collection, with the constraint that the collection must contain exactly one document.
- Fields are translated directly into properties of the collection's document.
- A field of set type is represented as an array of the given type.
- A field of enumeration type is represented as a string, using the enumeration constants as the possible string values.
- A field of the primitive type Flag is represented with a boolean value.
- A field of the primitive type Number is represented with an integer value.
- A field of the primitive type Date or DateTime is represented with a date datatype.

These same mappings apply to any document-based or relational database. The SSF is intentionally database-agnostic.
