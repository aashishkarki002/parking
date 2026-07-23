# user_app/models.py
from django.db import models
from django.contrib.auth.models import AbstractUser, BaseUserManager


class UserManager(BaseUserManager):
    """Manager for the custom user model."""

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('The Email field must be set')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    """Custom User Model."""
    username = None  # We use email instead of username
    email = models.EmailField(unique=True)

    # Fields from your frontend's LoginState
    phone_no = models.CharField(max_length=20, null=True, blank=True)
    is_email_verified = models.BooleanField(default=False)
    is_phone_verified = models.BooleanField(default=False)
    photo = models.ImageField(upload_to='user_photos/', null=True, blank=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    objects = UserManager()

    def __str__(self):
        return self.email

    @property
    def roles(self):
        # This allows us to use Django's built-in Groups as "roles"
        return self.groups.all()

    @property
    def permissions(self):
        # Returns a flat list of permission strings (e.g., "auth.add_group")
        if self.is_superuser:
            return ['superuser_all_access']
        return list(self.get_all_permissions())