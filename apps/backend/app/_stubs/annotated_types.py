"""Complete-enough stub of `annotated_types` for pydantic v2.

Loaded in hermetic tests via `sitecustomize.py`. Provides metadata container
classes referenced by pydantic's constraint parsing so imports succeed
without the real dependency installed.
"""

__version__ = "0.0-stub"

__all__ = [
    # base & grouping
    "BaseMetadata",
    "GroupedMetadata",
    # scalar constraints
    "Ge",
    "Gt",
    "Le",
    "Lt",
    "MultipleOf",
    # length / container
    "MinLen",
    "MaxLen",
    "MinItems",
    "MaxItems",
    "MinBytes",
    "MaxBytes",
    # misc metadata
    "Predicate",
    "Title",
    "Description",
]


class BaseMetadata:
    def __repr__(self):  # pragma: no cover
        return f"{self.__class__.__name__}()"


class GroupedMetadata(BaseMetadata):
    def __init__(self, *items):
        self.items = items

    def __iter__(self):
        return iter(self.items)  # pragma: no cover

    def __repr__(self):
        return f"GroupedMetadata({', '.join(map(repr, self.items))})"


class _Num(BaseMetadata):
    def __init__(self, value):
        self.value = value

    def __repr__(self):
        return f"{self.__class__.__name__}({self.value})"


class Ge(_Num):
    pass


class Gt(_Num):
    pass


class Le(_Num):
    pass


class Lt(_Num):
    pass


class MultipleOf(_Num):
    pass


class _Len(BaseMetadata):
    def __init__(self, n: int):
        self.n = n

    def __repr__(self):
        return f"{self.__class__.__name__}({self.n})"


class MinLen(_Len):
    pass


class MaxLen(_Len):
    pass


class MinItems(_Len):
    pass


class MaxItems(_Len):
    pass


class MinBytes(_Len):
    pass


class MaxBytes(_Len):
    pass


class Predicate(BaseMetadata):
    def __init__(self, func, message: str | None = None):
        self.func = func
        self.message = message

    def __repr__(self):
        return f"Predicate({getattr(self.func, '__name__', 'fn')})"


class Title(BaseMetadata):
    def __init__(self, title: str):
        self.title = title

    def __repr__(self):
        return f"Title({self.title!r})"


class Description(BaseMetadata):
    def __init__(self, description: str):
        self.description = description

    def __repr__(self):
        return f"Description({self.description!r})"
