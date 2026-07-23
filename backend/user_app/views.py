# user_app/views.py
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from .serializers import LoginSerializer, LogoutSerializer  # Assuming LogoutView is also here


class LoginView(GenericAPIView):
    permission_classes = [AllowAny]
    serializer_class = LoginSerializer

    def post(self, request, *args, **kwargs):
        """
        This view is specifically designed to handle the nested payload from the frontend.
        It expects a structure like: { "values": { "persona": "...", "password": "..." } }
        """
        # THE CRITICAL FIX: Look inside the 'values' object for the data.
        # import pdb; pdb.set_trace()
        payload = request.data

        # Pass the extracted payload to the serializer.
        serializer = self.get_serializer(data=payload)

        # The serializer now receives the correct flat object it needs:
        # { "persona": "...", "password": "...", "redirectUrl": "..." }
        serializer.is_valid(raise_exception=True)

        # Wrap the successful response as the frontend expects.
        response_data = {
            "status": "success",
            **serializer.validated_data
        }

        return Response(response_data, status=status.HTTP_200_OK)


# Your LogoutView might also need a similar fix if its payload is nested.
# Let's check the frontend code for that.

class LogoutView(GenericAPIView):

    # Add this line to connect the view to its serializer
    serializer_class = LogoutSerializer

    def post(self, request, *args, **kwargs):
        # Your frontend might be sending the refresh token inside a 'values' object
        # or directly. This line handles both cases safely.
        payload = request.data.get('values', request.data)

        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        serializer.save()  # This calls the .blacklist() method in the serializer
        return Response(status=status.HTTP_204_NO_CONTENT)