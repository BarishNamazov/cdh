# Why Concept Design?

Concept design is an approach to software development that achieves greater modularity in the structuring of application functionality. The key idea is to break the functionality down into separable, modular services called *concepts*, each of which can be specified, implemented and understood separately — by users and by developers.

The advantages of concept design include:
- Improved separation of concerns resulting in simpler and more robust design and implementation;
- Greater recognition of reusable behaviors, so reduced work for designers and developers and more familiar interactions for users;
- Improved focus on the purposes and motivations of the functionality, since each concept is closely targeted at delivering a particular function of value in the context of the larger app.

## What is a concept?

A concept is a reusable unit of user-facing functionality that serves a well-defined and intelligible purpose. Each concept maintains its own state, and interacts with the user (and with other concepts) through atomic actions.

A concept typically involves objects of several different kinds, holding relationships between them in its state. For example, the *Upvote* concept, whose purpose is to rank items by popularity, maintains a relationship between the items and the users who have approved or disapproved of them. The state of a concept must be sufficiently rich to support the concept's behavior; if *Upvote* lacked information about users, for example, it would not be able to prevent double voting. But the concept state should be no richer than it need be: *Upvote* would *not* include anything about a user beyond the user's identity, since the user's name (for example) plays no role in the concept's behavior.

## Concept Independence

Perhaps the most significant distinguishing feature of concepts, in comparison to other modularity schemes, is their mutual independence. Each concept is defined without reference to any other concepts, and can be understood in isolation.

Early work on mental models established the principle that, in a robust model, the different elements must be independently understandable. The same holds in software: the reason a user can make sense of a new social media app, for example, is that each of the concepts (*Post*, *Comment*, *Upvote*, *Friend*, etc) are not only familiar but also separable, so that understanding one doesn't require understanding another.

Concept independence lets design scale, because individual concepts can be worked on by different designers or design teams, and brought together later. Reuse requires independence too, because coupling between concepts would prevent a concept from being adopted without also including the concepts it depends on.

Polymorphism is key to independence: the designer of a concept should strive to make the concept as free as possible of any assumptions about the content and interpretation of objects passed as action arguments. Even if a *Comment* concept is used within an app only for comments on posts, it should be described as applying comments to arbitrary targets, defined only by their identity.

## Separation of concerns

One of the key advances of concept design is a more effective *separation of concerns* than is typical in software designs. Each concept addresses only a single, coherent aspect of the functionality of the application, and does not conflate aspects of functionality that could easily be separated.

In a traditional design, in contrast, concerns are often conflated, especially around objects (or classes). For example, it is common for a *User* class to handle all kinds of functions associated with users: authentication, profiles, naming, choice of communication channels for notification, and more. In a concept design, these would be separated into different concepts: one for authentication, one for profiles, one for naming, one for notification, and so on.

## Completeness of functionality

Another key distinction between concept design and traditional design is that concepts are *complete* with respect to their functionality and don't rely on functionality from other concepts. For example, a *Notification* concept that has an action to notify a user cannot "make a call" to an action of an emailing or text messaging context to actually deliver a notification. Instead that functionality would be part of the *Notification* concept itself.

## Composition by synchronization

Because concepts are fully independent of one another, they cannot refer to each other or use each other's services. Concepts are therefore composed using *synchronizations* (or *syncs*). A sync is a rule that says that *when* an action happens in one concept, *then* some action happens in another concept.

A sync can have multiple actions in its when and then clauses, and can refer to the state of multiple concepts in a where clause. For example, a sync may say that *when* a post p is deleted (in the *Post* concept), and *where* c is a comment on the post p (in the *Comment* concept), then comment c is deleted (in the *Comment* concept).

In CDH, syncs are defined in `src/syncs/**/*.sync.ts` files. Each sync is an exported const with `when` and `then` action references. Syncs that need to query concept state use a `where` clause with frame-based semantics. See `implementing-synchronizations.md` for the full DSL.

## Concept Reuse and Familiarity

Most concepts are reusable across applications; the same *Upvote* concept appears for upvoting comments in the New York Times and for upvoting answers on Stack Overflow. A concept can also be instantiated multiple times within the same application to play different roles.

From a user's perspective, this familiarity makes concepts easy to understand. From a designer's perspective, it allows concepts to be repositories of design knowledge and experience. The community of designers can develop "concept catalogs" that capture all this knowledge, along with relationships between concepts.
