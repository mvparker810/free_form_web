cmake_minimum_required(VERSION 3.16)
project(freeform_web_backend C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)

find_package(httplib CONFIG REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)

add_executable(backend
  main.cpp
)

# Base dir for free_form (relative to back/)
set(FREEFORM_BASE_DIR "${CMAKE_SOURCE_DIR}/../extern/free_form")

target_include_directories(backend PRIVATE "${FREEFORM_BASE_DIR}")

# Add the C implementation explicitly
set(FREEFORM_IMPL "${FREEFORM_BASE_DIR}/freeform_impl.c")
if(EXISTS "${FREEFORM_IMPL}")
  message(STATUS "Linking freeform implementation: ${FREEFORM_IMPL}")
  target_sources(backend PRIVATE "${FREEFORM_IMPL}")
else()
  message(FATAL_ERROR "freeform_impl.c not found at ${FREEFORM_IMPL}")
endif()

target_link_libraries(backend PRIVATE httplib::httplib nlohmann_json::nlohmann_json)
