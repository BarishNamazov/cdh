# Labeling

## Purpose

Allow users to attach labels to opaque items and later inspect labels by item.

## Principle

When a user labels an item and then lists labels for that item, the new label appears exactly once.

## State

- Labels keyed by item, user, and text.

## Actions

### addLabel

Requires: `item`, `user`, and `text` are non-empty; the same user has not already added the same label to the item.

Effects: stores the label and returns its id.

### removeLabel

Requires: a label with the supplied id exists.

Effects: removes the label.

## Queries

### _getLabels

Returns labels for an item.
