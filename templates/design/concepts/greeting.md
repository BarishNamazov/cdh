# Greeting

## Purpose

Greet users by name and track a history of greetings.

## Principle

When a user is greeted by name, they receive a personalized message and the greeting is recorded.

## State

- History of greeting records, each with name, message, and timestamp.

## Actions

### greet

Requires: a non-empty name.

Effects: returns a greeting message and appends to history.

### ungreet

Requires: a name previously greeted.

Effects: removes the greeting record from history.

## Queries

### _getHistory

Returns all greeting records in insertion order.
