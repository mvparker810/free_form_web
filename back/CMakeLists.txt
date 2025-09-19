cmake_minimum_required(VERSION 3.16)
project(complexlib_web_backend CXX)
set(CMAKE_CXX_STANDARD 17)

# vcpkg packages (install once: vcpkg install cpp-httplib nlohmann-json)
find_package(httplib CONFIG REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)

add_executable(backend main.cpp)

# Include your single-header library
# Prefer a local sibling repo during dev; fall back to submodule
set(LOCAL_COMPLEXLIB_DIR "${CMAKE_SOURCE_DIR}/../complexlib")
if(EXISTS "${LOCAL_COMPLEXLIB_DIR}/include/complexlib.h")
  message(STATUS "Using LOCAL complexlib at: ${LOCAL_COMPLEXLIB_DIR}")
  target_include_directories(backend PRIVATE "${LOCAL_COMPLEXLIB_DIR}/include")
else()
  message(STATUS "Using SUBMODULE complexlib at: ${CMAKE_SOURCE_DIR}/../extern/complexlib")
  target_include_directories(backend PRIVATE "${CMAKE_SOURCE_DIR}/../extern/complexlib/include")
endif()

target_link_libraries(backend PRIVATE httplib::httplib nlohmann_json::nlohmann_json)
