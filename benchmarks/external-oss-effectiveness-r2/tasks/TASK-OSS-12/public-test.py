from django.urls.utils import simplify_regex


assert simplify_regex(r"^articles/(\w+)/comments/(\d+)/$") == (
    "/articles/<var>/comments/<var>/"
)
