# user_app/serializers.py
from django.contrib.auth.models import Group, Permission
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from .models import User


# This serializer formats a single permission object
class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ['name']  # Matches frontend { name: string }


# This serializer formats a Group to match your 'roles' interface
class GroupSerializer(serializers.ModelSerializer):
    permissions = PermissionSerializer(many=True, read_only=True)
    codename = serializers.CharField(source='name')  # Use name for codename
    isActive = serializers.SerializerMethodField()
    isArchived = serializers.SerializerMethodField()
    isSystemManaged = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = [
            'codename', 'id', 'isActive', 'isArchived',
            'isSystemManaged', 'name', 'permissions'
        ]

    # Django's Group model doesn't have these fields, so we add them
    def get_isActive(self, obj): return True

    def get_isArchived(self, obj): return False

    def get_isSystemManaged(self, obj): return False


# This serializer formats the final user object for the response
class UserSerializer(serializers.ModelSerializer):
    roles = GroupSerializer(many=True, read_only=True)
    permissions = serializers.ListField(child=serializers.CharField(), read_only=True)
    # Map Django's snake_case to frontend's camelCase
    phoneNo = serializers.CharField(source='phone_no', read_only=True)
    isEmailVerified = serializers.BooleanField(source='is_email_verified', read_only=True)
    isPhoneVerified = serializers.BooleanField(source='is_phone_verified', read_only=True)
    isSuperuser = serializers.BooleanField(source='is_superuser', read_only=True)

    class Meta:
        model = User
        fields = [
            'email', 'phoneNo', 'isEmailVerified', 'isPhoneVerified',
            'roles', 'isSuperuser', 'permissions', 'photo'
        ]


# This serializer handles the login logic
class LoginSerializer(serializers.Serializer):
    # The frontend now sends 'persona' and 'redirectUrl'. We define them here.
    persona = serializers.EmailField(required=True)
    password = serializers.CharField(write_only=True, required=True)

    def validate(self, data):
        # The rest of this serializer remains exactly the same.
        user = authenticate(email=data.get('persona'), password=data.get('password'))
        if not user or not user.is_active:
            raise serializers.ValidationError("Incorrect username or password.")

        user_data = UserSerializer(user).data
        refresh = RefreshToken.for_user(user)
        tokens = {'access': str(refresh.access_token), 'refresh': str(refresh)}

        return {**user_data, 'tokens': tokens}


# This serializer handles the logout logic
class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()

    def save(self, **kwargs):
        try:
            RefreshToken(self.validated_data['refresh']).blacklist()
        except Exception:
            # The token is already invalid, expired, or blacklisted.
            # We don't need to do anything.
            pass